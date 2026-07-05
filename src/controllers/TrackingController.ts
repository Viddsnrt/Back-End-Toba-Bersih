import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// ─── Helpers ────────────────────────────────────────────────
const paramStr = (val: string | string[]): string =>
  Array.isArray(val) ? val[0] : val;

const getNamaHari = (date: Date): string => {
  const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
  return days[date.getDay()];
};

function getNamaHariIni(): string {
  const map: Record<number, string> = {
    0: 'MINGGU', 1: 'SENIN', 2: 'SELASA', 3: 'RABU',
    4: 'KAMIS', 5: 'JUMAT', 6: 'SABTU',
  };
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return map[now.getDay()];
}

const capitalize = (str: string): string =>
  str.charAt(0) + str.slice(1).toLowerCase();

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

function latLngToMeter(lat: number, lng: number, refLat: number): { x: number; y: number } {
  const R = 6371000;
  const x = (lng * Math.PI / 180) * R * Math.cos((refLat * Math.PI) / 180);
  const y = (lat * Math.PI / 180) * R;
  return { x, y };
}

function jarakTitikKeSegmen(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

async function getRuteDariDB(truckId: bigint, hari: string) {
  const rute = await prisma.routeTemplate.findFirst({
    where:   { truckId, dayOfWeek: hari, isActive: true },
    include: { waypoints: { orderBy: { order: 'asc' } } },
  });
  if (!rute) return null;
  return {
    hari:      rute.dayOfWeek,
    namaHari:  capitalize(rute.dayOfWeek),
    waypoints: rute.waypoints.map((wp) => ({
      urutan: wp.order,
      nama:   wp.name,
      lat:    wp.latitude,
      lng:    wp.longitude,
    })),
  };
}

// ============================================================
// GET: Truk aktif - UNTUK TRACKING REAL-TIME
// ============================================================
export const getTrukAktif = async (req: Request, res: Response): Promise<any> => {
  try {
    const hariIni = getNamaHariIni();

    const trukList = await prisma.truck.findMany({
      where: {
        routeTemplates: {
          some: { dayOfWeek: hariIni, isActive: true },
        },
      },
      include: {
        operator: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
        tasks: {
          where:   { status: { in: ['DITERIMA', 'DALAM_PERJALANAN', 'TIBA', 'BEKERJA'] } },
          orderBy: { updatedAt: 'desc' },
          take:    1,
          select:  { status: true, location: true },
        },
        routeTemplates: {
          where:   { dayOfWeek: hariIni, isActive: true },
          include: { waypoints: { orderBy: { order: 'asc' } } },
          take:    1,
        },
        locationHistory: {
          orderBy: { createdAt: 'desc' },
          take:    1,
          select:  { latitude: true, longitude: true, createdAt: true },
        },
      },
    });

    console.log(`[DEBUG] Jumlah truk dengan jadwal ${hariIni}: ${trukList.length}`);

    const formatted = trukList.map((truk) => {
      const lastLoc   = truk.locationHistory[0] ?? null;
      const taskAktif = truk.tasks[0] ?? null;

      const ruteHariIni = truk.routeTemplates[0]
        ? {
            hari:      truk.routeTemplates[0].dayOfWeek,
            namaHari:  capitalize(truk.routeTemplates[0].dayOfWeek),
            waypoints: truk.routeTemplates[0].waypoints.map((wp) => ({
              urutan: wp.order,
              nama:   wp.name,
              lat:    Number(wp.latitude),
              lng:    Number(wp.longitude),
            })),
          }
        : null;

      return {
        id:           truk.id.toString(),
        plateNumber:  truk.plateNumber,
        status:       truk.status,
        currentLat:   lastLoc ? Number(lastLoc.latitude)   : (truk.currentLat  ? Number(truk.currentLat)  : null),
        currentLong:  lastLoc ? Number(lastLoc.longitude)  : (truk.currentLong ? Number(truk.currentLong) : null),
        lastPing:     lastLoc?.createdAt?.toISOString() ?? truk.lastPing?.toISOString() ?? null,
        lastLocation: lastLoc
          ? { lat: Number(lastLoc.latitude), lng: Number(lastLoc.longitude), timestamp: lastLoc.createdAt.toISOString() }
          : null,
        operator: truk.operator
          ? { id: truk.operator.id.toString(), fullName: truk.operator.fullName, phoneNumber: truk.operator.phoneNumber }
          : null,
        taskAktif: taskAktif
          ? { status: taskAktif.status, location: taskAktif.location }
          : null,
        ruteHariIni,
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
// ============================================================
export const getRiwayatJalur = async (req: Request, res: Response): Promise<any> => {
  const truckIdStr = paramStr(req.params.truckId);
  const { tanggal } = req.query;

  try {
    const tglStr    = (tanggal as string) || new Date().toISOString().split('T')[0];
    const startDate = new Date(`${tglStr}T00:00:00+07:00`);
    const endDate   = new Date(`${tglStr}T23:59:59+07:00`);

    const [history, truk] = await Promise.all([
      prisma.locationHistory.findMany({
        where: {
          truckId:   BigInt(truckIdStr),
          createdAt: { gte: startDate, lte: endDate },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.truck.findUnique({
        where:   { id: BigInt(truckIdStr) },
        include: { operator: { select: { fullName: true, phoneNumber: true } } },
      }),
    ]);

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    const jalur = history.map((h) => ({
      lat:       Number(h.latitude),
      lng:       Number(h.longitude),
      timestamp: h.createdAt.toISOString(),
    }));

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

    const hariTanggal = getNamaHari(new Date(`${tglStr}T12:00:00+07:00`));
    const ruteJadwal  = await getRuteDariDB(BigInt(truckIdStr), hariTanggal);

    return res.status(200).json({
      success: true,
      data: {
        truckId:       truckIdStr,
        plateNumber:   truk.plateNumber,
        operatorName:  truk.operator?.fullName   ?? null,
        operatorPhone: truk.operator?.phoneNumber ?? null,
        tanggal:       tglStr,
        hariKerja:     hariTanggal,
        totalTitik:    jalur.length,
        jarakTotalKm:  Math.round(jarakTotalKm * 100) / 100,
        durasiMenit,
        durasiJam:     Math.round((durasiMenit / 60) * 10) / 10,
        waktuMulai:    jalur.length > 0 ? jalur[0].timestamp : null,
        waktuSelesai:  jalur.length > 0 ? jalur[jalur.length - 1].timestamp : null,
        jalur,
        ruteJadwal,
      },
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
  const truckIdStr = paramStr(req.params.truckId);
  const { tanggal } = req.query;

  if (!truckIdStr || isNaN(Number(truckIdStr))) {
    return res.status(400).json({ success: false, message: 'ID truk tidak valid' });
  }

  try {
    const tglStr    = (tanggal as string) || new Date().toISOString().split('T')[0];
    const startDate = new Date(`${tglStr}T00:00:00+07:00`);
    const endDate   = new Date(`${tglStr}T23:59:59+07:00`);

    const [taskSelesai, history, truk] = await Promise.all([
      prisma.task.findMany({
        where: {
          truckId:   BigInt(truckIdStr),
          updatedAt: { gte: startDate, lte: endDate },
          status:    'SELESAI',
        },
        include: { photo: true },
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.locationHistory.findMany({
        where: {
          truckId:   BigInt(truckIdStr),
          createdAt: { gte: startDate, lte: endDate },
        },
        orderBy: { createdAt: 'asc' },
        select:  { latitude: true, longitude: true, createdAt: true },
      }),
      prisma.truck.findUnique({
        where:   { id: BigInt(truckIdStr) },
        include: { operator: { select: { fullName: true, phoneNumber: true } } },
      }),
    ]);

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    const jalur = history.map((h) => ({
      lat:       Number(h.latitude),
      lng:       Number(h.longitude),
      timestamp: h.createdAt.toISOString(),
    }));

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

    const hariKerja  = getNamaHari(new Date(`${tglStr}T12:00:00+07:00`));
    const ruteJadwal = await getRuteDariDB(BigInt(truckIdStr), hariKerja);

    return res.status(200).json({
      success: true,
      data: {
        truckId:       truckIdStr,
        plateNumber:   truk.plateNumber,
        operatorName:  truk.operator?.fullName   ?? null,
        operatorPhone: truk.operator?.phoneNumber ?? null,
        tanggal:       tglStr,
        hariKerja,
        ringkasan: {
          totalTaskSelesai: taskSelesai.length,
          jarakTempuhKm:    Math.round(jarakTotalKm * 100) / 100,
          durasiKerjaMenit: durasiMenit,
          durasiKerjaJam:   Math.round((durasiMenit / 60) * 10) / 10,
          waktuMulai:   jalur.length > 0 ? jalur[0].timestamp : null,
          waktuSelesai: jalur.length > 0 ? jalur[jalur.length - 1].timestamp : null,
        },
        detailTask: taskSelesai.map((t) => ({
          id:               t.id.toString(),
          location:         t.location,
          completedAt:      t.updatedAt,
          jumlahFoto:       t.photo ? 1 : 0,
          deskripsiLaporan: null,
        })),
        jalurAktual: jalur,
        ruteJadwal,
      },
    });
  } catch (error: any) {
    console.error('getRingkasanHasil error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Riwayat SEMUA truk yang punya rekaman GPS di tanggal tsb
// ============================================================
export const getRiwayatSelesai = async (req: Request, res: Response): Promise<any> => {
  const { tanggal } = req.query;

  try {
    const tglStr    = (tanggal as string) || new Date().toISOString().split('T')[0];
    const startDate = new Date(`${tglStr}T00:00:00+07:00`);
    const endDate   = new Date(`${tglStr}T23:59:59+07:00`);

    const trukDenganRiwayat = await prisma.truck.findMany({
      where: {
        locationHistory: {
          some: { createdAt: { gte: startDate, lte: endDate } },
        },
      },
      include: {
        operator: { select: { fullName: true, phoneNumber: true } },
        locationHistory: {
          where:   { createdAt: { gte: startDate, lte: endDate } },
          orderBy: { createdAt: 'asc' },
          select:  { latitude: true, longitude: true, createdAt: true },
        },
      },
    });

    const hasil = trukDenganRiwayat.map((truk) => {
      const history = truk.locationHistory;

      let jarakKm = 0;
      for (let i = 1; i < history.length; i++) {
        jarakKm += hitungJarak(
          Number(history[i - 1].latitude), Number(history[i - 1].longitude),
          Number(history[i].latitude),     Number(history[i].longitude)
        );
      }

      let durasiMenit = 0;
      if (history.length >= 2) {
        const awal  = history[0].createdAt.getTime();
        const akhir = history[history.length - 1].createdAt.getTime();
        durasiMenit = Math.round((akhir - awal) / 60000);
      }

      return {
        trukId:       truk.id.toString(),
        plateNumber:  truk.plateNumber,
        operatorName: truk.operator?.fullName ?? '-',
        status:       truk.status,
        tanggal:      tglStr,
        ringkasan: {
          totalTitikLokasi: history.length,
          jarakTempuhKm:    Math.round(jarakKm * 100) / 100,
          durasiKerjaMenit: durasiMenit,
          durasiKerjaJam:   Math.round((durasiMenit / 60) * 10) / 10,
          waktuMulai:   history.length > 0 ? history[0].createdAt.toISOString() : null,
          waktuSelesai: history.length > 0 ? history[history.length - 1].createdAt.toISOString() : null,
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: hasil,
      meta: {
        tanggal: tglStr,
        total:   hasil.length,
        selesai: hasil.filter((h) => h.status === 'AVAILABLE').length,
        aktif:   hasil.filter((h) => h.status === 'BUSY').length,
      },
    });
  } catch (error: any) {
    console.error('getRiwayatSelesai error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Jadwal rute
// ============================================================
export const getJadwalRute = async (req: Request, res: Response): Promise<any> => {
  const { hari, truckId } = req.query;

  try {
    const hariStr =
      typeof hari === 'string'
        ? hari
        : Array.isArray(hari)
        ? String(hari[0])
        : '';

    const hariUpper = hariStr.toUpperCase();

    if (hariUpper === 'SEMUA') {
      const semua = await prisma.routeTemplate.findMany({
        where: {
          isActive: true,
          ...(truckId ? { truckId: BigInt(truckId as string) } : {}),
        },
        include: {
          truck:     { select: { plateNumber: true } },
          waypoints: { orderBy: { order: 'asc' } },
        },
        orderBy: [{ truck: { plateNumber: 'asc' } }, { dayOfWeek: 'asc' }],
      });
      return res.status(200).json({ success: true, data: semua });
    }

    const where: any = { dayOfWeek: hariUpper, isActive: true };
    if (truckId) where.truckId = BigInt(truckId as string);

    const rute = await prisma.routeTemplate.findFirst({
      where,
      include: { waypoints: { orderBy: { order: 'asc' } } },
    });

    if (!rute) {
      return res.status(404).json({
        success: false,
        message: `Tidak ada jadwal aktif untuk hari ${hariUpper}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        hari:      rute.dayOfWeek,
        namaHari:  capitalize(rute.dayOfWeek),
        waypoints: rute.waypoints.map((wp) => ({
          urutan: wp.order,
          nama:   wp.name,
          lat:    wp.latitude,
          lng:    wp.longitude,
        })),
      },
    });
  } catch (error: any) {
    console.error('getJadwalRute error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Supir kirim lokasi GPS dari HP
// ============================================================
export const updateLokasiTruk = async (req: Request, res: Response): Promise<any> => {
  const { truckId, latitude, longitude } = req.body;

  if (!truckId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      success: false,
      message: 'truckId, latitude, longitude wajib diisi',
    });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'Koordinat tidak valid' });
  }

  try {
    const hariIni   = getNamaHariIni();
    const ruteAktif = await prisma.routeTemplate.findFirst({
      where:   { truckId: BigInt(truckId), dayOfWeek: hariIni, isActive: true },
      include: { waypoints: { orderBy: { order: 'asc' } } },
    });

    console.log(`[GPS] Truk ${truckId} | hari=${hariIni} | rute ditemukan=${!!ruteAktif} | jumlah waypoint=${ruteAktif?.waypoints.length ?? 0}`);

    if (!ruteAktif || ruteAktif.waypoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Truk belum memiliki rute aktif untuk hari ${hariIni}. Hubungi admin untuk mengatur rute terlebih dahulu.`,
      });
    }

    // ── Validasi jarak dari jalur rute ──────────────────────────
    const RADIUS_METER = 100;
    const waypoints    = ruteAktif.waypoints;
    const driverXY     = latLngToMeter(lat, lng, lat);
    const waypointsXY  = waypoints.map((wp) => ({
      ...wp,
      xy: latLngToMeter(Number(wp.latitude), Number(wp.longitude), lat),
    }));

    let jarakMinimal   = Infinity;
    let segmenTerdekat = '';

    if (waypointsXY.length === 1) {
      const wp       = waypointsXY[0];
      jarakMinimal   = Math.hypot(driverXY.x - wp.xy.x, driverXY.y - wp.xy.y);
      segmenTerdekat = wp.name;
    } else {
      for (let i = 0; i < waypointsXY.length - 1; i++) {
        const a     = waypointsXY[i];
        const b     = waypointsXY[i + 1];
        const jarak = jarakTitikKeSegmen(
          driverXY.x, driverXY.y,
          a.xy.x, a.xy.y,
          b.xy.x, b.xy.y
        );
        if (jarak < jarakMinimal) {
          jarakMinimal   = jarak;
          segmenTerdekat = `${a.name} → ${b.name}`;
        }
      }
    }

    jarakMinimal = Math.round(jarakMinimal);

    if (jarakMinimal > RADIUS_METER) {
      console.warn(`[GPS REJECTED] Truk ${truckId} berada ${jarakMinimal}m dari rute`);
      return res.status(400).json({
        success: false,
        message: `Lokasi Anda berada ${jarakMinimal}m dari jalur rute (dekat segmen "${segmenTerdekat}"). Maksimal ${RADIUS_METER}m dari jalur rute yang ditetapkan.`,
        data:    { jarakDariRute: jarakMinimal, segmenTerdekat, radiusMaksimal: RADIUS_METER },
      });
    }

    console.log(`[GPS OK] Truk ${truckId} berada ${jarakMinimal}m dari rute ✅`);

    // ── Simpan posisi terkini truk ───────────────────────────────
    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data:  { currentLat: lat, currentLong: lng, lastPing: new Date() },
    });

    await prisma.locationHistory.create({
      data: { truckId: BigInt(truckId), latitude: lat, longitude: lng },
    });

    // ── Deklarasi io di sini agar bisa dipakai di seluruh fungsi ─
    // PENTING: harus dideklarasikan SEBELUM blok auto-update waypoint
    const io = req.app.get('io');

    // ── AUTO UPDATE WAYPOINT STATUS ──────────────────────────────
    // Logika: cek apakah truk sudah cukup dekat dengan waypoint berikutnya
    // Jika ya → tandai SELESAI, lanjut ke waypoint berikutnya → SEDANG_DITUJU
    const RADIUS_WAYPOINT = 50; // meter, jarak untuk dianggap "tiba"

    const ruteWaypoint = await prisma.routeTemplate.findFirst({
      where:   { truckId: BigInt(truckId), dayOfWeek: hariIni, isActive: true },
      include: { waypoints: { orderBy: { order: 'asc' } } },
    });

    if (ruteWaypoint && ruteWaypoint.waypoints.length > 0) {
      const wps = ruteWaypoint.waypoints;

      // Prioritas: cari yang SEDANG_DITUJU dulu, kalau tidak ada ambil BELUM_DILALUI pertama
      const targetWp = wps.find(wp => wp.status === 'SEDANG_DITUJU')
        ?? wps.find(wp => wp.status === 'BELUM_DILALUI')
        ?? null;

      if (targetWp) {
        // Hitung jarak truk ke waypoint target (dalam meter)
        const jarakKeWaypoint = hitungJarak(
          lat, lng,
          Number(targetWp.latitude),
          Number(targetWp.longitude)
        ) * 1000; // hitungJarak hasilnya km, kali 1000 → meter

        if (jarakKeWaypoint <= RADIUS_WAYPOINT) {
          // ✅ Truk sudah tiba → tandai waypoint ini SELESAI
          await prisma.routeWaypoint.update({
            where: { id: targetWp.id },
            data:  { status: 'SELESAI', arrivedAt: new Date() },
          });

          // Cari waypoint berikutnya (order + 1 yang masih BELUM_DILALUI)
          const wpBerikutnya = wps.find(
            wp => wp.order === targetWp.order + 1 && wp.status === 'BELUM_DILALUI'
          );

          if (wpBerikutnya) {
            // Tandai waypoint berikutnya sebagai SEDANG_DITUJU
            await prisma.routeWaypoint.update({
              where: { id: wpBerikutnya.id },
              data:  { status: 'SEDANG_DITUJU' },
            });
          }

          // Kirim notif real-time ke admin & pelanggan via Socket.IO
          if (io) {
            io.emit('waypoint_update', {
              truckId: truckId.toString(),
              waypointSelesai: {
                id:    targetWp.id.toString(),
                nama:  targetWp.name,
                order: targetWp.order,
              },
              waypointBerikutnya: wpBerikutnya
                ? {
                    id:    wpBerikutnya.id.toString(),
                    nama:  wpBerikutnya.name,
                    order: wpBerikutnya.order,
                  }
                : null, // null berarti semua waypoint sudah selesai
            });
          }

        } else if (targetWp.status === 'BELUM_DILALUI') {
          // Waypoint pertama belum ditandai SEDANG_DITUJU → tandai sekarang
          await prisma.routeWaypoint.update({
            where: { id: targetWp.id },
            data:  { status: 'SEDANG_DITUJU' },
          });
        }
      }
    }
    // ── END AUTO UPDATE WAYPOINT STATUS ─────────────────────────

    // Kirim update posisi truk real-time ke semua client
    if (io) {
      io.emit('truck_location_update', {
        truckId:   truckId.toString(),
        latitude:  lat,
        longitude: lng,
        timestamp: new Date().toISOString(),
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

    // Update status truk menjadi BUSY
    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data:  { status: 'BUSY', lastPing: new Date() },
    });

    const hariIni = getNamaHariIni();

    // ── RESET WAYPOINT SAAT MULAI KERJA BARU ────────────────────
    // Tujuan: pastikan progress hari ini selalu mulai dari nol
    // agar tidak tercampur dengan sisa progress hari sebelumnya
    const ruteMulaiKerja = await prisma.routeTemplate.findFirst({
      where: { truckId: BigInt(truckId), dayOfWeek: hariIni, isActive: true },
    });

    if (ruteMulaiKerja) {
      await prisma.routeWaypoint.updateMany({
        where: { routeId: ruteMulaiKerja.id },
        data:  { status: 'BELUM_DILALUI', arrivedAt: null },
      });
      console.log(`[RESET] Waypoint rute ${ruteMulaiKerja.id} direset untuk truk ${truckId}`);
    }
    // ── END RESET WAYPOINT ───────────────────────────────────────

    const ruteHariIni = await getRuteDariDB(BigInt(truckId), hariIni);

    const io = req.app.get('io');
    if (io) {
      io.emit('truck_status_update', {
        truckId:     truckId.toString(),
        status:      'BUSY',
        plateNumber: truk.plateNumber,
        timestamp:   new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      message: `Truk ${truk.plateNumber} mulai beroperasi`,
      data: {
        truckId:     truckId.toString(),
        plateNumber: truk.plateNumber,
        hariKerja:   hariIni,
        ruteHariIni,
      },
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
      where:   { id: BigInt(truckId) },
      include: { operator: { select: { fullName: true } } },
    });

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }
    if (truk.status !== 'BUSY') {
      return res.status(400).json({ success: false, message: 'Truk tidak dalam status bekerja' });
    }

    await prisma.truck.update({
      where: { id: BigInt(truckId) },
      data:  { status: 'AVAILABLE', lastPing: new Date() },
    });

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const history = await prisma.locationHistory.findMany({
      where:   { truckId: BigInt(truckId), createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    });

    let jarakKm = 0;
    for (let i = 1; i < history.length; i++) {
      jarakKm += hitungJarak(
        Number(history[i - 1].latitude), Number(history[i - 1].longitude),
        Number(history[i].latitude),     Number(history[i].longitude)
      );
    }

    const durasiMenit = history.length >= 2
      ? Math.round(
          (history[history.length - 1].createdAt.getTime() -
            history[0].createdAt.getTime()) / 60000
        )
      : 0;

    const ringkasan = {
      totalTitikLokasi: history.length,
      jarakTempuhKm:    Math.round(jarakKm * 100) / 100,
      durasiKerjaMenit: durasiMenit,
      durasiKerjaJam:   Math.round((durasiMenit / 60) * 10) / 10,
      waktuMulai:   history.length > 0 ? history[0].createdAt.toISOString() : null,
      waktuSelesai: history.length > 0 ? history[history.length - 1].createdAt.toISOString() : null,
    };

    const io = req.app.get('io');
    if (io) {
      io.emit('truck_status_update', {
        truckId:      truckId.toString(),
        status:       'AVAILABLE',
        plateNumber:  truk.plateNumber,
        operatorName: truk.operator?.fullName ?? '-',
        timestamp:    new Date().toISOString(),
        data:         { ringkasan },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Truk ${truk.plateNumber} selesai beroperasi`,
      data:    { ringkasan },
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
        operator: { select: { id: true, fullName: true, phoneNumber: true } },
      },
    });

    return res.status(200).json({
      success: true,
      data: trukList.map((truk) => ({
        id:          truk.id.toString(),
        plateNumber: truk.plateNumber,
        status:      truk.status,
        brand:       truk.brand,
        truckType:   truk.truckType,
        unitCode:    truk.unitCode,
        operatorId:  truk.operatorId ? truk.operatorId.toString() : null,
        operator:    truk.operator
          ? { ...truk.operator, id: truk.operator.id.toString() }
          : null,
      })),
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
      where:  { role: 'OPERATOR' },
      select: { id: true, fullName: true, email: true, phoneNumber: true, isActive: true },
    });

    return res.status(200).json({
      success: true,
      data: supirList.map((s) => ({ ...s, id: s.id.toString() })),
    });
  } catch (error: any) {
    console.error('getSemuaSupir error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Pelanggan lihat truk di wilayahnya (via locationId)
// ============================================================
export const getTrukByWilayah = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user?.id;

    const pelanggan = await prisma.pelanggan.findUnique({
      where:   { userId: BigInt(userId) },
      include: { location: { select: { id: true, name: true } } },
    });

    if (!pelanggan) {
      return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan' });
    }

    const hariIni = getNamaHariIni();

    const rute = await prisma.routeTemplate.findFirst({
      where: {
        locationId: pelanggan.locationId,
        dayOfWeek:  hariIni,
        isActive:   true,
      },
      include: {
        truck: {
          include: {
            operator: { select: { fullName: true } },
            locationHistory: {
              orderBy: { createdAt: 'desc' },
              take:    1,
              select:  { latitude: true, longitude: true, createdAt: true },
            },
          },
        },
        waypoints: { orderBy: { order: 'asc' } },
      },
    });

    if (!rute) {
      return res.status(404).json({
        success: false,
        message: `Tidak ada armada yang bertugas di wilayah ${pelanggan.location.name} hari ini`,
      });
    }

    const truk          = rute.truck;
    const lastLoc       = truk.locationHistory[0] ?? null;
    const totalWaypoint = rute.waypoints.length;
    const selesai       = rute.waypoints.filter(wp => wp.status === 'SELESAI').length;
    const sedangDituju  = rute.waypoints.find(wp => wp.status === 'SEDANG_DITUJU');

    return res.status(200).json({
      success: true,
      data: {
        wilayah:    pelanggan.location.name,
        armada:     truk.plateNumber,
        supir:      truk.operator?.fullName ?? '-',
        rute:       rute.name,
        statusTruk: truk.status,
        lokasiSaatIni: {
          lat:      lastLoc ? Number(lastLoc.latitude)   : (truk.currentLat  ? Number(truk.currentLat)  : null),
          lng:      lastLoc ? Number(lastLoc.longitude)  : (truk.currentLong ? Number(truk.currentLong) : null),
          lastPing: lastLoc?.createdAt?.toISOString() ?? null,
        },
        progress: {
          selesai,
          total:        totalWaypoint,
          sedangMenuju: sedangDituju?.name ?? null,
        },
        waypoints: rute.waypoints.map(wp => ({
          urutan:    wp.order,
          nama:      wp.name,
          status:    wp.status,
          arrivedAt: wp.arrivedAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error: any) {
    console.error('getTrukByWilayah error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Progress waypoint truk hari ini
// Dipakai oleh: Admin (monitor rute), Pelanggan (lihat progress)
// ============================================================
export const getProgressWaypoint = async (req: Request, res: Response): Promise<any> => {
  const truckId = paramStr(req.params.truckId);

  try {
    const hariIni = getNamaHariIni();

    const rute = await prisma.routeTemplate.findFirst({
      where: {
        truckId:   BigInt(truckId),
        dayOfWeek: hariIni,
        isActive:  true,
      },
      include: {
        waypoints: { orderBy: { order: 'asc' } },
        truck: {
          select: {
            plateNumber: true,
            currentLat:  true,
            currentLong: true,
            status:      true,
            operator:    { select: { fullName: true } },
          },
        },
      },
    });

    if (!rute) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada rute aktif hari ini untuk truk ini',
      });
    }

    const selesai      = rute.waypoints.filter(wp => wp.status === 'SELESAI').length;
    const total        = rute.waypoints.length;
    const sedangDituju = rute.waypoints.find(wp => wp.status === 'SEDANG_DITUJU');

    return res.status(200).json({
      success: true,
      data: {
        truckId:     truckId.toString(),
        plateNumber: rute.truck.plateNumber,
        supir:       rute.truck.operator?.fullName ?? '-',
        statusTruk:  rute.truck.status,
        lokasiSaatIni: {
          lat: rute.truck.currentLat  ? Number(rute.truck.currentLat)  : null,
          lng: rute.truck.currentLong ? Number(rute.truck.currentLong) : null,
        },
        progress: {
          selesai,
          total,
          persen:       total > 0 ? Math.round((selesai / total) * 100) : 0,
          sedangMenuju: sedangDituju?.name ?? null,
        },
        waypoints: rute.waypoints.map(wp => ({
          id:        wp.id.toString(),
          order:     wp.order,
          nama:      wp.name,
          status:    wp.status,       // BELUM_DILALUI | SEDANG_DITUJU | SELESAI
          arrivedAt: wp.arrivedAt?.toISOString() ?? null,
          lat:       wp.latitude,
          lng:       wp.longitude,
        })),
      },
    });
  } catch (error: any) {
    console.error('getProgressWaypoint error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};