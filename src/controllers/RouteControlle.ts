import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// ─── Helpers ────────────────────────────────────────────────
const paramStr = (val: string | string[]): string =>
  Array.isArray(val) ? val[0] : val;

const HARI_VALID = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];

function getNamaHari(date: Date): string {
  const map: Record<number, string> = {
    0: 'MINGGU', 1: 'SENIN', 2: 'SELASA', 3: 'RABU',
    4: 'KAMIS', 5: 'JUMAT', 6: 'SABTU',
  };
  return map[date.getDay()];
}

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

// ─── NEW Helper: Validasi apakah satu titik berada dalam radius wilayah ──
    function isWithinRadius(
      centerLat: number,
      centerLng: number,
      radiusMeter: number,
      pointLat: number,
      pointLng: number
    ): { valid: boolean; distanceMeter: number } {
      const distanceKm = hitungJarak(centerLat, centerLng, pointLat, pointLng);
      const distanceMeter = Math.round(distanceKm * 1000);
      return { valid: distanceMeter <= radiusMeter, distanceMeter };
    }

async function getRuteDariDB(truckId: bigint, hari: string) {
  try {
    const rute = await prisma.routeTemplate.findFirst({
      where: { truckId, dayOfWeek: hari, isActive: true },
      include: { waypoints: { orderBy: { order: 'asc' } } },
    });
    if (!rute) return null;
    return {
      hari:      rute.dayOfWeek,
      namaHari:  rute.dayOfWeek,
      waypoints: rute.waypoints.map((wp) => ({
        urutan: wp.order,
        nama:   wp.name,
        lat:    Number(wp.latitude),
        lng:    Number(wp.longitude),
      })),
    };
  } catch {
    return null;
  }
}

// ============================================================
// GET: Semua rute template
// ============================================================
export const getSemuaRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { truckId, hari } = req.query;
    const where: any = {};
    if (truckId) where.truckId  = BigInt(truckId as string);
    if (hari)    where.dayOfWeek = (hari as string).toUpperCase();

    const rute = await prisma.routeTemplate.findMany({
      where,
      include: {
        truck:    { select: { id: true, plateNumber: true } },
        location: { select: { id: true, name: true } },
        waypoints: { orderBy: { order: 'asc' } },
        _count: { select: { waypoints: true } },
      },
      orderBy: [{ truck: { plateNumber: 'asc' } }, { dayOfWeek: 'asc' }],
    });

    const formatted = rute.map(r => ({
      ...r,
      id:         r.id.toString(),
      truckId:    r.truckId.toString(),
      locationId: r.locationId.toString(),
      truck:      { ...r.truck, id: r.truck.id.toString() },
      waypoints: r.waypoints.map(wp => ({
        ...wp,
        id:      wp.id.toString(),
        routeId: wp.routeId.toString(),
      })),
      totalWaypoint: r._count.waypoints,
    }));

    return res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('getSemuaRute error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Detail satu rute + waypoints
// ============================================================
export const getDetailRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const ruteId = paramStr(req.params.ruteId);

    const rute = await prisma.routeTemplate.findUnique({
      where: { id: BigInt(ruteId) },
      include: {
        truck:    { select: { id: true, plateNumber: true } },
        location: { select: { id: true, name: true } },
        waypoints: { orderBy: { order: 'asc' } },
      },
    });

    if (!rute) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...rute,
        id:         rute.id.toString(),
        truckId:    rute.truckId.toString(),
        locationId: rute.locationId.toString(),
        truck:      { ...rute.truck, id: rute.truck.id.toString() },
        waypoints: rute.waypoints.map(wp => ({
          ...wp,
          id:      wp.id.toString(),
          routeId: wp.routeId.toString(),
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Buat rute template baru
// ============================================================
export const buatRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { truckId, dayOfWeek, name, isActive, locationId } = req.body;

    if (!truckId || !dayOfWeek || !name || !locationId) {
      return res.status(400).json({
        success: false,
        message: 'truckId, dayOfWeek, name, dan locationId wajib diisi',
      });
    }

    const hariUpper = (dayOfWeek as string).toUpperCase();
    if (!HARI_VALID.includes(hariUpper)) {
      return res.status(400).json({
        success: false,
        message: `dayOfWeek tidak valid. Pilihan: ${HARI_VALID.join(', ')}`,
      });
    }

    const truk = await prisma.truck.findUnique({ where: { id: BigInt(truckId) } });
    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    const location = await prisma.location.findUnique({ where: { id: BigInt(locationId) } });
    if (!location) {
      return res.status(404).json({ success: false, message: 'Lokasi tidak ditemukan' });
    }

    const existing = await prisma.routeTemplate.findFirst({
      where: { truckId: BigInt(truckId), dayOfWeek: hariUpper },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Rute untuk truk ${truk.plateNumber} hari ${hariUpper} sudah ada`,
      });
    }

    const rute = await prisma.routeTemplate.create({
      data: {
        truckId:    BigInt(truckId),
        locationId: BigInt(locationId),
        dayOfWeek:  hariUpper,
        name,
        isActive:   isActive !== undefined ? Boolean(isActive) : true,
      },
      include: {
        truck:    { select: { id: true, plateNumber: true } },
        location: { select: { id: true, name: true } },
        waypoints: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Rute ${name} berhasil dibuat`,
      data: {
        ...rute,
        id:         rute.id.toString(),
        truckId:    rute.truckId.toString(),
        locationId: rute.locationId.toString(),
        truck:      { ...rute.truck, id: rute.truck.id.toString() },
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Rute untuk kombinasi truk & hari ini sudah ada' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT: Update info rute
// ============================================================
export const updateRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const ruteId = paramStr(req.params.ruteId);
    const { name, isActive, truckId, dayOfWeek, locationId } = req.body;

    // NEW: sertakan waypoints supaya bisa divalidasi ulang kalau lokasi diganti
    const existing = await prisma.routeTemplate.findUnique({
      where: { id: BigInt(ruteId) },
      include: { waypoints: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    if (dayOfWeek) {
      const hariUpper = (dayOfWeek as string).toUpperCase();
      if (!HARI_VALID.includes(hariUpper)) {
        return res.status(400).json({
          success: false,
          message: `dayOfWeek tidak valid. Pilihan: ${HARI_VALID.join(', ')}`,
        });
      }
    }

    let newLocation: { id: bigint; name: string; latitude: any; longitude: any; radius: number | null } | null = null;

    if (locationId) {
      newLocation = await prisma.location.findUnique({ where: { id: BigInt(locationId) } });
      if (!newLocation) {
        return res.status(404).json({ success: false, message: 'Lokasi tidak ditemukan' });
      }
    }

    const newTruckId    = truckId    ? BigInt(truckId)    : existing.truckId;
    const newLocationId = locationId ? BigInt(locationId) : existing.locationId;
    const newDayOfWeek  = dayOfWeek  ? (dayOfWeek as string).toUpperCase() : existing.dayOfWeek;

    // ── NEW: Kalau wilayah BENAR-BENAR berubah dan rute sudah punya waypoint,
    // cek apakah semua waypoint lama masih masuk akal di radius wilayah baru ──
    const wilayahBerubah = newLocationId.toString() !== existing.locationId.toString();

    if (wilayahBerubah && existing.waypoints.length > 0 && newLocation?.radius) {
      const centerLat = Number(newLocation.latitude);
      const centerLng = Number(newLocation.longitude);
      const radiusMeter = newLocation.radius;

      const titikDiluarWilayah: string[] = [];
      for (const wp of existing.waypoints) {
        const { valid, distanceMeter } = isWithinRadius(
          centerLat, centerLng, radiusMeter,
          Number(wp.latitude), Number(wp.longitude)
        );
        if (!valid) {
          titikDiluarWilayah.push(`"${wp.name}" (±${distanceMeter}m, maksimal ${radiusMeter}m)`);
        }
      }

      if (titikDiluarWilayah.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Tidak bisa mengganti wilayah ke "${newLocation.name}" karena ${titikDiluarWilayah.length} titik rute ini berada di luar radius wilayah baru: ${titikDiluarWilayah.join('; ')}. Hapus atau perbarui titik-titik tersebut terlebih dahulu lewat menu Edit Titik Rute.`
        });
      }
    }

    if (
      newTruckId.toString() !== existing.truckId.toString() ||
      newDayOfWeek !== existing.dayOfWeek
    ) {
      const duplikat = await prisma.routeTemplate.findFirst({
        where: {
          truckId:   newTruckId,
          dayOfWeek: newDayOfWeek,
          id:        { not: BigInt(ruteId) },
        },
      });
      if (duplikat) {
        return res.status(400).json({
          success: false,
          message: `Rute untuk kombinasi truk & hari ${newDayOfWeek} ini sudah ada`,
        });
      }
    }

    const updated = await prisma.routeTemplate.update({
      where: { id: BigInt(ruteId) },
      data: {
        name:       name      !== undefined ? name              : existing.name,
        isActive:   isActive  !== undefined ? Boolean(isActive) : existing.isActive,
        truckId:    newTruckId,
        locationId: newLocationId,
        dayOfWeek:  newDayOfWeek,
      },
      include: {
        truck:     { select: { id: true, plateNumber: true } },
        location:  { select: { id: true, name: true } },
        waypoints: { orderBy: { order: 'asc' } },
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        ...updated,
        id:         updated.id.toString(),
        truckId:    updated.truckId.toString(),
        locationId: updated.locationId.toString(),
        truck:      { ...updated.truck, id: updated.truck.id.toString() },
        waypoints:  updated.waypoints.map(wp => ({
          ...wp,
          id:      wp.id.toString(),
          routeId: wp.routeId.toString(),
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// DELETE: Hapus rute + semua waypointnya
// ============================================================
export const hapusRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const ruteId = paramStr(req.params.ruteId);

    const existing = await prisma.routeTemplate.findUnique({
      where: { id: BigInt(ruteId) },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    await prisma.routeTemplate.delete({ where: { id: BigInt(ruteId) } });

    return res.status(200).json({ success: true, message: 'Rute berhasil dihapus' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PATCH: Toggle aktif/nonaktif rute
// ============================================================
export const toggleStatusRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const ruteId = paramStr(req.params.ruteId);

    const existing = await prisma.routeTemplate.findUnique({
      where: { id: BigInt(ruteId) },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    const updated = await prisma.routeTemplate.update({
      where: { id: BigInt(ruteId) },
      data:  { isActive: !existing.isActive },
    });

    return res.status(200).json({
      success: true,
      message: `Rute ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
      data: {
        ...updated,
        id:         updated.id.toString(),
        truckId:    updated.truckId.toString(),
        locationId: updated.locationId.toString(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Tambah waypoint ke rute
// ============================================================
export const tambahWaypoint = async (req: Request, res: Response): Promise<any> => {
  try {
    const ruteId = paramStr(req.params.ruteId);
    const { name, latitude, longitude, order, bulk } = req.body;

    // NEW: sertakan location supaya bisa cek radius
    const rute = await prisma.routeTemplate.findUnique({
      where: { id: BigInt(ruteId) },
      include: { location: true },
    });
    if (!rute) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    const radiusMeter = rute.location?.radius ?? null;
    const centerLat   = Number(rute.location?.latitude);
    const centerLng   = Number(rute.location?.longitude);

    if (bulk && Array.isArray(bulk)) {
      // ── NEW: Validasi SEMUA titik harus berada dalam radius wilayah ──
      if (radiusMeter) {
        const titikDiluarWilayah: string[] = [];

        for (const wp of bulk) {
          const { valid, distanceMeter } = isWithinRadius(
            centerLat, centerLng, radiusMeter,
            Number(wp.latitude), Number(wp.longitude)
          );
          if (!valid) {
            titikDiluarWilayah.push(
              `"${wp.name}" (±${distanceMeter}m dari pusat wilayah, maksimal ${radiusMeter}m)`
            );
          }
        }

        if (titikDiluarWilayah.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Titik berikut berada di luar radius wilayah "${rute.location?.name}": ${titikDiluarWilayah.join('; ')}`
          });
        }
      }

      await prisma.routeWaypoint.deleteMany({ where: { routeId: BigInt(ruteId) } });

      const created = await prisma.$transaction(
        bulk.map((wp: any, idx: number) =>
          prisma.routeWaypoint.create({
            data: {
              routeId:   BigInt(ruteId),
              order:     wp.order ?? idx + 1,
              name:      wp.name,
              latitude:  Number(wp.latitude),
              longitude: Number(wp.longitude),
            },
          })
        )
      );

      return res.status(201).json({
        success: true,
        message: `${created.length} waypoint berhasil disimpan`,
        data: created.map(wp => ({
          ...wp,
          id:      wp.id.toString(),
          routeId: wp.routeId.toString(),
        })),
      });
    }

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, latitude, longitude wajib diisi',
      });
    }

    // ── NEW: Validasi satu titik harus berada dalam radius wilayah ──
    if (radiusMeter) {
      const { valid, distanceMeter } = isWithinRadius(
        centerLat, centerLng, radiusMeter,
        Number(latitude), Number(longitude)
      );
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: `Titik "${name}" berada di luar radius wilayah "${rute.location?.name}" (±${distanceMeter}m, maksimal ${radiusMeter}m).`
        });
      }
    }

    let urutan = order;
    if (!urutan) {
      const maxOrder = await prisma.routeWaypoint.aggregate({
        where: { routeId: BigInt(ruteId) },
        _max:  { order: true },
      });
      urutan = (maxOrder._max.order ?? 0) + 1;
    }

    const wp = await prisma.routeWaypoint.create({
      data: {
        routeId:   BigInt(ruteId),
        order:     urutan,
        name,
        latitude:  Number(latitude),
        longitude: Number(longitude),
      },
    });

    return res.status(201).json({
      success: true,
      data: { ...wp, id: wp.id.toString(), routeId: wp.routeId.toString() },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT: Update satu waypoint
// ============================================================
export const updateWaypoint = async (req: Request, res: Response): Promise<any> => {
  try {
    const waypointId = paramStr(req.params.waypointId);
    const { name, latitude, longitude, order } = req.body;

    const existing = await prisma.routeWaypoint.findUnique({
      where: { id: BigInt(waypointId) },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Waypoint tidak ditemukan' });
    }

    const newLat = latitude  !== undefined ? Number(latitude)  : Number(existing.latitude);
    const newLng = longitude !== undefined ? Number(longitude) : Number(existing.longitude);

    // ── NEW: Validasi radius hanya kalau koordinat memang berubah ──
    if (latitude !== undefined || longitude !== undefined) {
      const rute = await prisma.routeTemplate.findUnique({
        where: { id: existing.routeId },
        include: { location: true },
      });

      if (rute?.location?.radius) {
        const { valid, distanceMeter } = isWithinRadius(
          Number(rute.location.latitude),
          Number(rute.location.longitude),
          rute.location.radius,
          newLat,
          newLng
        );

        if (!valid) {
          return res.status(400).json({
            success: false,
            message: `Koordinat baru berada di luar radius wilayah "${rute.location.name}" (±${distanceMeter}m, maksimal ${rute.location.radius}m).`
          });
        }
      }
    }

    const updated = await prisma.routeWaypoint.update({
      where: { id: BigInt(waypointId) },
      data: {
        name:      name      !== undefined ? name : existing.name,
        latitude:  newLat,
        longitude: newLng,
        order:     order     !== undefined ? Number(order) : existing.order,
      },
    });

    return res.status(200).json({
      success: true,
      data: { ...updated, id: updated.id.toString(), routeId: updated.routeId.toString() },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// DELETE: Hapus satu waypoint + re-order sisanya
// ============================================================
export const hapusWaypoint = async (req: Request, res: Response): Promise<any> => {
  try {
    const waypointId = paramStr(req.params.waypointId);

    const existing = await prisma.routeWaypoint.findUnique({
      where: { id: BigInt(waypointId) },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Waypoint tidak ditemukan' });
    }

    const routeId      = existing.routeId;
    const deletedOrder = existing.order;

    await prisma.$transaction([
      prisma.routeWaypoint.delete({ where: { id: BigInt(waypointId) } }),
      prisma.routeWaypoint.updateMany({
        where: { routeId, order: { gt: deletedOrder } },
        data:  { order: { decrement: 1 } },
      }),
    ]);

    return res.status(200).json({ success: true, message: 'Waypoint berhasil dihapus' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT: Reorder semua waypoint
// ============================================================
export const reorderWaypoints = async (req: Request, res: Response): Promise<any> => {
  try {
    const ruteId  = paramStr(req.params.ruteId);
    const { urutan } = req.body;

    if (!Array.isArray(urutan)) {
      return res.status(400).json({ success: false, message: 'urutan harus berupa array' });
    }

    await prisma.$transaction(
      urutan.map((item: { id: string; order: number }) =>
        prisma.routeWaypoint.update({
          where: { id: BigInt(item.id) },
          data:  { order: item.order },
        })
      )
    );

    return res.status(200).json({ success: true, message: 'Urutan waypoint berhasil diperbarui' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GET: Ringkasan hasil operasional truk
// ============================================================
export const getRingkasanHasil = async (req: Request, res: Response): Promise<any> => {
  const truckId = paramStr(req.params.truckId);
  const { tanggal } = req.query;

  try {
    const tglStr    = (tanggal as string) || new Date().toISOString().split('T')[0];
    const startDate = new Date(`${tglStr}T00:00:00+07:00`);
    const endDate   = new Date(`${tglStr}T23:59:59+07:00`);

    const [history, truk] = await Promise.all([
      prisma.locationHistory.findMany({
        where: {
          truckId:   BigInt(truckId),
          createdAt: { gte: startDate, lte: endDate },
        },
        orderBy: { createdAt: 'asc' },
        select:  { latitude: true, longitude: true, createdAt: true },
      }),
      prisma.truck.findUnique({
        where:   { id: BigInt(truckId) },
        include: { operator: { select: { fullName: true, phoneNumber: true } } },
      }),
    ]);

    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    let taskSelesai: any[] = [];
    try {
      taskSelesai = await prisma.task.findMany({
        where: {
          truckId:   BigInt(truckId),
          updatedAt: { gte: startDate, lte: endDate },
          status:    'SELESAI',
        },
        orderBy: { updatedAt: 'asc' },
      });
    } catch (taskErr) {
      console.warn('getRingkasanHasil: query task gagal:', taskErr);
      taskSelesai = [];
    }

    const jalur = history.map(h => ({
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
      durasiMenit = Math.round(
        (new Date(jalur[jalur.length - 1].timestamp).getTime() -
          new Date(jalur[0].timestamp).getTime()) / 60000
      );
    }

    const hariKerja  = getNamaHari(new Date(`${tglStr}T12:00:00+07:00`));
    const ruteJadwal = await getRuteDariDB(BigInt(truckId), hariKerja);

    return res.status(200).json({
      success: true,
      data: {
        truckId,
        plateNumber:   truk.plateNumber,
        operatorName:  truk.operator?.fullName   ?? null,
        operatorPhone: truk.operator?.phoneNumber ?? null,
        tanggal:       tglStr,
        hariKerja,
        ringkasan: {
          totalTaskSelesai:    taskSelesai.length,
          totalVolumeSampahKg: 0,
          jarakTempuhKm:       Math.round(jarakTotalKm * 100) / 100,
          durasiKerjaMenit:    durasiMenit,
          durasiKerjaJam:      Math.round((durasiMenit / 60) * 10) / 10,
          waktuMulai:   jalur.length > 0 ? jalur[0].timestamp : null,
          waktuSelesai: jalur.length > 0 ? jalur[jalur.length - 1].timestamp : null,
        },
        detailTask: taskSelesai.map((t: any) => ({
          id:          t.id?.toString(),
          location:    t.location,
          completedAt: t.updatedAt,
          jumlahFoto:  0,
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