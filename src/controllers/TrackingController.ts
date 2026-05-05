import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// ─── Helpers ────────────────────────────────────────────────

/** Ambil nama hari (uppercase) dari Date */
const getNamaHari = (date: Date): string => {
  const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  return days[date.getDay()];
};

/** "SENIN" → "Senin" */
const capitalize = (str: string): string =>
  str.charAt(0) + str.slice(1).toLowerCase();

/** Haversine: jarak dua koordinat dalam km */
function hitungJarak(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ambil rute dari DB untuk truk + hari tertentu.
 * Return null jika tidak ada rute aktif untuk kombinasi tersebut.
 */
async function getRuteDariDB(truckId: bigint, hari: string) {
  const rute = await prisma.routeTemplate.findFirst({
    where: { truckId, dayOfWeek: hari, isActive: true },
    include: { waypoints: { orderBy: { order: 'asc' } } }
  });

  if (!rute) return null;

  return {
    hari:     rute.dayOfWeek,
    namaHari: capitalize(rute.dayOfWeek),
    waypoints: rute.waypoints.map(wp => ({
      urutan: wp.order,
      nama:   wp.name,
      lat:    wp.latitude,
      lng:    wp.longitude,
    }))
  };
}

// ============================================================
// GET: Truk aktif (status BUSY) — untuk peta admin
// Yang ditracking = TRUK, lokasi dikirim dari HP SUPIR
// ============================================================
export const getTrukAktif = async (req: Request, res: Response): Promise<any> => {
  try {
    const hariIni = getNamaHari(new Date());

    const trukAktif = await prisma.truck.findMany({
      where: { status: 'BUSY' },
      include: {
        // Data supir (operator) yang mengemudikan truk
        operator: {
          select: { id: true, fullName: true, phoneNumber: true }
        },
        // Task aktif yang sedang dikerjakan
        tasks: {
          where: { status: { in: ['DITERIMA', 'DALAM_PERJALANAN', 'TIBA', 'BEKERJA'] } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { status: true, location: true, district: true }
        },
        // Rute jadwal hari ini dari DB (hasil input admin)
        // routes: {
        //   where: { dayOfWeek: hariIni, isActive: true },
        //   include: { waypoints: { orderBy: { order: 'asc' } } },
        //   take: 1
        // }
        routesTemplate: {
          where: { dayOfWeek: hariIni, isActive: true },
         include: { waypoints: { orderBy: { order: 'asc' } } },
         take: 1
         }
      }
    });

    const formatted = trukAktif.map(truk => {
      const ruteDB = truk.routesTemplate[0] || null;

      return {
        id:           truk.id.toString(),
        plateNumber:  truk.plateNumber,
        status:       truk.status,
        // Koordinat terkini dikirim dari HP supir via updateLokasiTruk
        currentLat:   truk.currentLat  ? Number(truk.currentLat)  : null,
        currentLong:  truk.currentLong ? Number(truk.currentLong) : null,
        lastPing:     truk.lastPing,
        lastLocation: truk.lastLocation,
        operator:     truk.operator
          ? { ...truk.operator, id: truk.operator.id.toString() }
          : null,
        taskAktif:    truk.tasks[0] || null,
        // Rute jadwal hari ini (dari DB, bukan hardcode)
        ruteHariIni:  ruteDB ? {
          hari:     ruteDB.dayOfWeek,
          namaHari: capitalize(ruteDB.dayOfWeek),
          waypoints: ruteDB.waypoints.map(wp => ({
            urutan: wp.order,
            nama:   wp.name,
            lat:    wp.latitude,
            lng:    wp.longitude,
          }))
        } : null,
      };
    });

    return res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('getTrukAktif error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Riwayat jalur truk berdasarkan tanggal
// Jalur = rekaman titik GPS yang dikirim dari HP supir
// ============================================================
export const getRiwayatJalur = async (req: Request, res: Response): Promise<any> => {
  const { truckId } = req.params;
  const { tanggal } = req.query;

  try {
    const tglStr    = (tanggal as string) || new Date().toISOString().split('T')[0];
    const startDate = new Date(`${tglStr}T00:00:00+07:00`);
    const endDate   = new Date(`${tglStr}T23:59:59+07:00`);

    const [history, truk] = await Promise.all([
      prisma.locationHistory.findMany({
        where: {
          truckId: BigInt(truckId),
          createdAt: { gte: startDate, lte: endDate }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.truck.findUnique({
        where: { id: BigInt(truckId) },
        include: { operator: { select: { fullName: true, phoneNumber: true } } }
      })
    ]);

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    const jalur = history.map(h => ({
      lat:       Number(h.latitude),
      lng:       Number(h.longitude),
      timestamp: h.createdAt.toISOString()
    }));

    // Hitung jarak total (Haversine)
    let jarakTotalKm = 0;
    for (let i = 1; i < jalur.length; i++) {
      jarakTotalKm += hitungJarak(
        jalur[i - 1].lat, jalur[i - 1].lng,
        jalur[i].lat,     jalur[i].lng
      );
    }

    // Hitung durasi
    let durasiMenit = 0;
    if (jalur.length >= 2) {
      const awal  = new Date(jalur[0].timestamp).getTime();
      const akhir = new Date(jalur[jalur.length - 1].timestamp).getTime();
      durasiMenit = Math.round((akhir - awal) / 60000);
    }

    // Rute jadwal dari DB untuk hari tanggal tersebut
    const hariTanggal = getNamaHari(new Date(`${tglStr}T12:00:00+07:00`));
    const ruteJadwal  = await getRuteDariDB(BigInt(truckId), hariTanggal);

    return res.status(200).json({
      success: true,
      data: {
        truckId:       truckId.toString(),
        plateNumber:   truk.plateNumber,
        operatorName:  truk.operator?.fullName,
        operatorPhone: truk.operator?.phoneNumber,
        tanggal:       tglStr,
        hariKerja:     hariTanggal,
        totalTitik:    jalur.length,
        jarakTotalKm:  Math.round(jarakTotalKm * 100) / 100,
        durasiMenit,
        durasiJam:     Math.round((durasiMenit / 60) * 10) / 10,
        waktuMulai:    jalur.length > 0 ? jalur[0].timestamp : null,
        waktuSelesai:  jalur.length > 0 ? jalur[jalur.length - 1].timestamp : null,
        jalur,
        ruteJadwal   // overlay rute jadwal di peta (dari DB)
      }
    });
  } catch (error: any) {
    console.error('getRiwayatJalur error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Ringkasan hasil kerja setelah rute selesai
// ============================================================
export const getRingkasanHasil = async (req: Request, res: Response): Promise<any> => {
  const { truckId } = req.params;
  const { tanggal } = req.query;

  try {
    const tglStr    = (tanggal as string) || new Date().toISOString().split('T')[0];
    const startDate = new Date(`${tglStr}T00:00:00+07:00`);
    const endDate   = new Date(`${tglStr}T23:59:59+07:00`);

    const [taskSelesai, history, truk] = await Promise.all([
      // Task yang diselesaikan hari itu
      prisma.task.findMany({
        where: {
          truckId:     BigInt(truckId),
          completedAt: { gte: startDate, lte: endDate },
          status:      'SELESAI'
        },
        include: {
          photos: true,
          report: { select: { description: true, jenisSampah: true } }
        },
        orderBy: { completedAt: 'asc' }
      }),
      // Rekaman jalur GPS hari itu
      prisma.locationHistory.findMany({
        where: {
          truckId:   BigInt(truckId),
          createdAt: { gte: startDate, lte: endDate }
        },
        orderBy: { createdAt: 'asc' },
        select: { latitude: true, longitude: true, createdAt: true }
      }),
      // Data truk + operator
      prisma.truck.findUnique({
        where: { id: BigInt(truckId) },
        include: { operator: { select: { fullName: true, phoneNumber: true } } }
      })
    ]);

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    const jalur = history.map(h => ({
      lat:       Number(h.latitude),
      lng:       Number(h.longitude),
      timestamp: h.createdAt.toISOString()
    }));

    // Hitung jarak & durasi
    let jarakTotalKm = 0;
    for (let i = 1; i < jalur.length; i++) {
      jarakTotalKm += hitungJarak(
        jalur[i - 1].lat, jalur[i - 1].lng,
        jalur[i].lat,     jalur[i].lng
      );
    }

    let durasiMenit = 0;
    if (jalur.length >= 2) {
      const awal  = new Date(jalur[0].timestamp).getTime();
      const akhir = new Date(jalur[jalur.length - 1].timestamp).getTime();
      durasiMenit = Math.round((akhir - awal) / 60000);
    }

    const totalVolume = taskSelesai.reduce(
      (sum, t) => sum + (t.volumeKg ? Number(t.volumeKg) : 0), 0
    );

    // Rute jadwal dari DB
    const hariKerja  = getNamaHari(new Date(`${tglStr}T12:00:00+07:00`));
    const ruteJadwal = await getRuteDariDB(BigInt(truckId), hariKerja);

    return res.status(200).json({
      success: true,
      data: {
        truckId:       truckId.toString(),
        plateNumber:   truk.plateNumber,
        operatorName:  truk.operator?.fullName,
        operatorPhone: truk.operator?.phoneNumber,
        tanggal:       tglStr,
        hariKerja,
        ringkasan: {
          totalTaskSelesai:    taskSelesai.length,
          totalVolumeSampahKg: Math.round(totalVolume * 100) / 100,
          jarakTempuhKm:       Math.round(jarakTotalKm * 100) / 100,
          durasiKerjaMenit:    durasiMenit,
          durasiKerjaJam:      Math.round((durasiMenit / 60) * 10) / 10,
          waktuMulai:   jalur.length > 0 ? jalur[0].timestamp : null,
          waktuSelesai: jalur.length > 0 ? jalur[jalur.length - 1].timestamp : null,
        },
        detailTask: taskSelesai.map(t => ({
          id:          t.id.toString(),
          location:    t.location,
          district:    t.district,
          completedAt: t.completedAt,
          volumeKg:    t.volumeKg ? Number(t.volumeKg) : null,
          notes:       t.notes,
          jumlahFoto:  t.photos.length
        })),
        jalurAktual: jalur,
        ruteJadwal
      }
    });
  } catch (error: any) {
    console.error('getRingkasanHasil error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Jadwal rute (query dari DB, bukan hardcode)
// ============================================================
export const getJadwalRute = async (req: Request, res: Response): Promise<any> => {
  const { hari } = req.params;
  const { truckId } = req.query;

  try {
    const hariUpper = (hari || '').toUpperCase();

    if (hariUpper === 'SEMUA') {
      // Semua rute aktif di DB
      const semua = await prisma.routeTemplate.findMany({
        where: { isActive: true, ...(truckId ? { truckId: BigInt(truckId as string) } : {}) },
        include: {
          truck:     { select: { plateNumber: true } },
          waypoints: { orderBy: { order: 'asc' } }
        },
        orderBy: [{ truck: { plateNumber: 'asc' } }, { dayOfWeek: 'asc' }]
      });
      return res.status(200).json({ success: true, data: semua });
    }

    const where: any = { dayOfWeek: hariUpper, isActive: true };
    if (truckId) where.truckId = BigInt(truckId as string);

    const rute = await prisma.routeTemplate.findFirst({
      where,
      include: { waypoints: { orderBy: { order: 'asc' } } }
    });

    if (!rute) {
      return res.status(404).json({
        success: false,
        message: `Tidak ada jadwal aktif untuk hari ${hariUpper}${truckId ? ' dan truk tersebut' : ''}`
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        hari:     rute.dayOfWeek,
        namaHari: capitalize(rute.dayOfWeek),
        waypoints: rute.waypoints.map(wp => ({
          urutan: wp.order,
          nama:   wp.name,
          lat:    wp.latitude,
          lng:    wp.longitude,
        }))
      }
    });
  } catch (error: any) {
    console.error('getJadwalRute error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Supir kirim lokasi GPS dari HP
// Ini yang menyebabkan posisi truk bergerak di peta admin
// ============================================================
export const updateLokasiTruk = async (req: Request, res: Response): Promise<any> => {
  const { truckId, latitude, longitude } = req.body;

  if (!truckId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      message: 'truckId, latitude, longitude wajib diisi'
    });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'Koordinat tidak valid' });
  }

  try {
    // Update posisi terkini di tabel trucks
    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data: {
        currentLat:  lat.toString(),
        currentLong: lng.toString(),
        lastPing:    new Date()
      }
    });

    // Simpan ke riwayat (menjadi rekaman jalur harian)
    await prisma.locationHistory.create({
      data: {
        truckId:   BigInt(truckId),
        latitude:  lat.toString(),
        longitude: lng.toString()
      }
    });

    // Broadcast ke semua admin via Socket.io (real-time)
    const io = req.app.get('io');
    if (io) {
      io.emit('truck_location_update', {
        truckId:   truckId.toString(),
        latitude:  lat,
        longitude: lng,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({ success: true, message: 'Lokasi berhasil diupdate' });
  } catch (error: any) {
    console.error('updateLokasiTruk error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Supir mulai kerja → status truk BUSY
// ============================================================
export const mulaiKerja = async (req: Request, res: Response): Promise<any> => {
  const { truckId } = req.body;

  if (!truckId) {
    return res.status(400).json({ success: false, message: 'truckId wajib diisi' });
  }

  try {
    const truk = await prisma.truck.findUnique({ where: { id: BigInt(truckId) } });

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    if (truk.status === 'BUSY') {
      return res.status(400).json({ success: false, message: 'Truk sudah dalam status bekerja' });
    }

    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data: { status: 'BUSY', lastPing: new Date() }
    });

    // Ambil rute jadwal hari ini dari DB untuk dikembalikan ke app supir
    const hariIni     = getNamaHari(new Date());
    const ruteHariIni = await getRuteDariDB(BigInt(truckId), hariIni);

    const io = req.app.get('io');
    if (io) {
      io.emit('truck_status_update', {
        truckId:     truckId.toString(),
        status:      'BUSY',
        plateNumber: truk.plateNumber,
        timestamp:   new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: `Truk ${truk.plateNumber} mulai beroperasi`,
      data: {
        truckId:      truckId.toString(),
        plateNumber:  truk.plateNumber,
        hariKerja:    hariIni,
        ruteHariIni   // Rute dari DB — bisa ditampilkan di app supir
      }
    });
  } catch (error: any) {
    console.error('mulaiKerja error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Supir selesai kerja → status truk AVAILABLE
// ============================================================
export const selesaiKerja = async (req: Request, res: Response): Promise<any> => {
  const { truckId } = req.body;

  if (!truckId) {
    return res.status(400).json({ success: false, message: 'truckId wajib diisi' });
  }

  try {
    const truk = await prisma.truck.findUnique({
      where: { id: BigInt(truckId) },
      include: { operator: { select: { fullName: true } } }
    });

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    if (truk.status !== 'BUSY') {
      return res.status(400).json({ success: false, message: 'Truk tidak dalam status bekerja' });
    }

    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data: { status: 'AVAILABLE', lastPing: new Date() }
    });

    // Hitung rekaman hari ini
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const history = await prisma.locationHistory.findMany({
      where: { truckId: BigInt(truckId), createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' }
    });

    let jarakKm = 0;
    for (let i = 1; i < history.length; i++) {
      jarakKm += hitungJarak(
        Number(history[i - 1].latitude), Number(history[i - 1].longitude),
        Number(history[i].latitude),     Number(history[i].longitude)
      );
    }

    const durasiMenit = history.length >= 2
      ? Math.round((history[history.length - 1].createdAt.getTime() - history[0].createdAt.getTime()) / 60000)
      : 0;

    const io = req.app.get('io');
    if (io) {
      io.emit('truck_status_update', {
        truckId:     truckId.toString(),
        status:      'AVAILABLE',
        plateNumber: truk.plateNumber,
        timestamp:   new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: `Truk ${truk.plateNumber} selesai beroperasi`,
      data: {
        ringkasan: {
          totalTitikLokasi: history.length,
          jarakTempuhKm:    Math.round(jarakKm * 100) / 100,
          durasiKerjaMenit: durasiMenit,
          durasiKerjaJam:   Math.round((durasiMenit / 60) * 10) / 10,
          waktuMulai:   history.length > 0 ? history[0].createdAt : null,
          waktuSelesai: history.length > 0 ? history[history.length - 1].createdAt : null,
        }
      }
    });
  } catch (error: any) {
    console.error('selesaiKerja error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Semua truk (untuk dropdown)
// ============================================================
export const getSemuaTruk = async (req: Request, res: Response): Promise<any> => {
  try {
    const trukList = await prisma.truck.findMany({
      include: {
        operator: { select: { id: true, fullName: true, phoneNumber: true } }
      }
    });

    return res.status(200).json({
      success: true,
      data: trukList.map(truk => ({
        ...truk,
        id:         truk.id.toString(),
        operatorId: truk.operatorId ? truk.operatorId.toString() : null,
        operator:   truk.operator ? { ...truk.operator, id: truk.operator.id.toString() } : null
      }))
    });
  } catch (error: any) {
    console.error('getSemuaTruk error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Semua supir/operator (untuk dropdown)
// ============================================================
export const getSemuaSupir = async (req: Request, res: Response): Promise<any> => {
  try {
    const supirList = await prisma.user.findMany({
      where: { role: 'OPERATOR' },
      select: { id: true, fullName: true, email: true, phoneNumber: true, isActive: true }
    });

    return res.status(200).json({
      success: true,
      data: supirList.map(s => ({ ...s, id: s.id.toString() }))
    });
  } catch (error: any) {
    console.error('getSemuaSupir error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};