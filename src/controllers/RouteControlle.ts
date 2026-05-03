import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

const HARI_VALID = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];

// ============================================================
// GET: Semua rute template (bisa filter by truckId / hari)
// ============================================================
export const getSemuaRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { truckId, hari } = req.query;
    const where: any = {};
    if (truckId) where.truckId = BigInt(truckId as string);
    if (hari)    where.dayOfWeek = (hari as string).toUpperCase();

    const rute = await prisma.routeTemplate.findMany({
      where,
      include: {
        truck: { select: { id: true, plateNumber: true } },
        waypoints: { orderBy: { order: 'asc' } },
        _count: { select: { waypoints: true } }
      },
      orderBy: [{ truck: { plateNumber: 'asc' } }, { dayOfWeek: 'asc' }]
    });

    const formatted = rute.map(r => ({
      ...r,
      id:      r.id.toString(),
      truckId: r.truckId.toString(),
      truck:   { ...r.truck, id: r.truck.id.toString() },
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
    const { ruteId } = req.params;

    const rute = await prisma.routeTemplate.findUnique({
      where: { id: BigInt(ruteId) },
      include: {
        truck: { select: { id: true, plateNumber: true } },
        waypoints: { orderBy: { order: 'asc' } }
      }
    });

    if (!rute) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...rute,
        id:      rute.id.toString(),
        truckId: rute.truckId.toString(),
        truck:   { ...rute.truck, id: rute.truck.id.toString() },
        waypoints: rute.waypoints.map(wp => ({
          ...wp,
          id:      wp.id.toString(),
          routeId: wp.routeId.toString(),
        }))
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// POST: Buat rute template baru (tanpa waypoint dulu)
// ============================================================
export const buatRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { truckId, dayOfWeek, name, isActive } = req.body;

    if (!truckId || !dayOfWeek || !name) {
      return res.status(400).json({
        success: false,
        message: 'truckId, dayOfWeek, dan name wajib diisi'
      });
    }

    const hariUpper = dayOfWeek.toUpperCase();
    if (!HARI_VALID.includes(hariUpper)) {
      return res.status(400).json({
        success: false,
        message: `dayOfWeek tidak valid. Pilihan: ${HARI_VALID.join(', ')}`
      });
    }

    // Cek truk ada
    const truk = await prisma.truck.findUnique({ where: { id: BigInt(truckId) } });
    if (!truk) {
      return res.status(404).json({ success: false, message: 'Truk tidak ditemukan' });
    }

    // Cek duplikat
    const existing = await prisma.routeTemplate.findFirst({
      where: { truckId: BigInt(truckId), dayOfWeek: hariUpper }
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Rute untuk truk ${truk.plateNumber} hari ${hariUpper} sudah ada`
      });
    }

    const rute = await prisma.routeTemplate.create({
      data: {
        truckId:   BigInt(truckId),
        dayOfWeek: hariUpper,
        name,
        isActive:  isActive !== undefined ? Boolean(isActive) : true,
      },
      include: {
        truck: { select: { id: true, plateNumber: true } },
        waypoints: true
      }
    });

    return res.status(201).json({
      success: true,
      message: `Rute ${name} berhasil dibuat`,
      data: {
        ...rute,
        id:      rute.id.toString(),
        truckId: rute.truckId.toString(),
        truck:   { ...rute.truck, id: rute.truck.id.toString() },
      }
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Rute untuk kombinasi truk & hari ini sudah ada' });
    }
    console.error('buatRute error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT: Update info rute (nama, aktif/nonaktif)
// ============================================================
export const updateRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ruteId } = req.params;
    const { name, isActive } = req.body;

    const existing = await prisma.routeTemplate.findUnique({ where: { id: BigInt(ruteId) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    const updated = await prisma.routeTemplate.update({
      where: { id: BigInt(ruteId) },
      data: {
        name:     name     !== undefined ? name     : existing.name,
        isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      },
      include: {
        truck:     { select: { id: true, plateNumber: true } },
        waypoints: { orderBy: { order: 'asc' } }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        ...updated,
        id:      updated.id.toString(),
        truckId: updated.truckId.toString(),
        truck:   { ...updated.truck, id: updated.truck.id.toString() },
        waypoints: updated.waypoints.map(wp => ({
          ...wp, id: wp.id.toString(), routeId: wp.routeId.toString()
        }))
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// DELETE: Hapus rute + semua waypointnya (cascade)
// ============================================================
export const hapusRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ruteId } = req.params;

    const existing = await prisma.routeTemplate.findUnique({ where: { id: BigInt(ruteId) } });
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
// POST: Tambah waypoint ke rute (satu per satu atau bulk)
// ============================================================
export const tambahWaypoint = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ruteId } = req.params;
    const { name, latitude, longitude, order, bulk } = req.body;

    const rute = await prisma.routeTemplate.findUnique({ where: { id: BigInt(ruteId) } });
    if (!rute) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    // Mode BULK: kirim array waypoints sekaligus
    if (bulk && Array.isArray(bulk)) {
      // Hapus semua waypoint lama dulu (replace mode)
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
            }
          })
        )
      );

      return res.status(201).json({
        success: true,
        message: `${created.length} waypoint berhasil disimpan`,
        data: created.map(wp => ({
          ...wp, id: wp.id.toString(), routeId: wp.routeId.toString()
        }))
      });
    }

    // Mode SINGLE: tambah satu waypoint
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, latitude, longitude wajib diisi'
      });
    }

    // Auto-order: ambil max order + 1 jika tidak disuplai
    let urutan = order;
    if (!urutan) {
      const maxOrder = await prisma.routeWaypoint.aggregate({
        where: { routeId: BigInt(ruteId) },
        _max: { order: true }
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
      }
    });

    return res.status(201).json({
      success: true,
      data: { ...wp, id: wp.id.toString(), routeId: wp.routeId.toString() }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT: Update satu waypoint (nama / koordinat / urutan)
// ============================================================
export const updateWaypoint = async (req: Request, res: Response): Promise<any> => {
  try {
    const { waypointId } = req.params;
    const { name, latitude, longitude, order } = req.body;

    const existing = await prisma.routeWaypoint.findUnique({ where: { id: BigInt(waypointId) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Waypoint tidak ditemukan' });
    }

    const updated = await prisma.routeWaypoint.update({
      where: { id: BigInt(waypointId) },
      data: {
        name:      name      !== undefined ? name                : existing.name,
        latitude:  latitude  !== undefined ? Number(latitude)   : existing.latitude,
        longitude: longitude !== undefined ? Number(longitude)  : existing.longitude,
        order:     order     !== undefined ? Number(order)      : existing.order,
      }
    });

    return res.status(200).json({
      success: true,
      data: { ...updated, id: updated.id.toString(), routeId: updated.routeId.toString() }
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
    const { waypointId } = req.params;

    const existing = await prisma.routeWaypoint.findUnique({ where: { id: BigInt(waypointId) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Waypoint tidak ditemukan' });
    }

    const routeId = existing.routeId;
    const deletedOrder = existing.order;

    await prisma.$transaction([
      // Hapus waypoint
      prisma.routeWaypoint.delete({ where: { id: BigInt(waypointId) } }),
      // Geser urutan waypoint setelahnya
      prisma.routeWaypoint.updateMany({
        where: { routeId, order: { gt: deletedOrder } },
        data: { order: { decrement: 1 } }
      })
    ]);

    return res.status(200).json({ success: true, message: 'Waypoint berhasil dihapus' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PUT: Reorder semua waypoint dalam satu rute (drag & drop)
// ============================================================
export const reorderWaypoints = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ruteId } = req.params;
    // urutan: [{ id: '1', order: 1 }, { id: '2', order: 2 }, ...]
    const { urutan } = req.body;

    if (!Array.isArray(urutan)) {
      return res.status(400).json({ success: false, message: 'urutan harus berupa array' });
    }

    await prisma.$transaction(
      urutan.map((item: { id: string; order: number }) =>
        prisma.routeWaypoint.update({
          where: { id: BigInt(item.id) },
          data:  { order: item.order }
        })
      )
    );

    return res.status(200).json({ success: true, message: 'Urutan waypoint berhasil diperbarui' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// PATCH: Toggle aktif/nonaktif rute
// ============================================================
export const toggleStatusRute = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ruteId } = req.params;

    const existing = await prisma.routeTemplate.findUnique({ where: { id: BigInt(ruteId) } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Rute tidak ditemukan' });
    }

    const updated = await prisma.routeTemplate.update({
      where: { id: BigInt(ruteId) },
      data:  { isActive: !existing.isActive }
    });

    return res.status(200).json({
      success: true,
      message: `Rute ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
      data: { id: updated.id.toString(), isActive: updated.isActive }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};