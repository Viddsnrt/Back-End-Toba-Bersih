import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// ─── Helper Firebase Cloud Messaging (FCM) ──────────────────────
const sendPushNotification = async (fcmToken: string, title: string, body: string) => {
  try {
    console.log(`[Firebase Service] Berhasil mengirim push notification ke token: ${fcmToken.substring(0, 15)}...`);
  } catch (error) {
    console.error("[Firebase Service Error] Gagal mengirim push notification:", error);
  }
};

// ─── Helper: Nama hari Indonesia dari Date Real-time (WIB) ──────
function getNamaHariIni(): string {
  const map: Record<number, string> = {
    0: 'MINGGU', 1: 'SENIN', 2: 'SELASA', 3: 'RABU',
    4: 'KAMIS', 5: 'JUMAT', 6: 'SABTU',
  };
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return map[now.getDay()];
}

// ─── Helper: Nama hari Indonesia untuk Logika Histori/Riwayat ────
function getNamaHari(date: Date): string {
  const map: Record<number, string> = {
    0: 'MINGGU', 1: 'SENIN', 2: 'SELASA', 3: 'RABU',
    4: 'KAMIS', 5: 'JUMAT', 6: 'SABTU',
  };
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return map[localDate.getDay()];
}

// ─── NEW Helper: Apakah sebuah task BENAR-BENAR masih dianggap aktif/menyibukkan? ──
// Task dengan status DITUGASKAN tapi sudah lewat jadwal (scheduledAt) TIDAK lagi
// dianggap aktif, sehingga truk/supirnya boleh ditugaskan ulang.
const isTaskTrulyActive = (task: { status: string; scheduledAt: Date | null }): boolean => {
  if (task.status === 'SELESAI') return false;
  if (task.status === 'BEKERJA') return true; // sedang dikerjakan -> selalu aktif
  if (!task.scheduledAt) return true; // tidak ada jadwal -> anggap aktif (jaga-jaga)
  // status DITUGASKAN tapi sudah lewat jadwal -> TIDAK dianggap aktif lagi
  return new Date() <= new Date(task.scheduledAt);
};

// ─── Buat Tugas Rutin ───────────────────────────────────────────
export const createRutin = async (req: Request, res: Response): Promise<any> => {
  try {
    const { driverId, truckId, scheduledAt, location} = req.body;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const taskNumber = `RUTIN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTask = await prisma.task.create({
      data: {
        taskNumber,
        type: 'RUTIN',
        location,
        scheduledAt: new Date(scheduledAt),
        driverId: BigInt(driverId as string),
        truckId: truckId ? BigInt(truckId as string) : null,
      }
    });

    return res.status(201).json({ success: true, data: { ...newTask, id: newTask.id.toString() } });
  } catch (error: any) {
    console.error("ERROR CREATE RUTIN:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Buat Tugas Aduan ───────────────────────────────────────────
export const createAduan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reportId, driverId, truckId, scheduledAt, location, description } = req.body;

    if (!location) {
      return res.status(400).json({ 
        success: false, 
        message: "Field location wajib diisi." 
      });
    }

    // 🔥 AMBIL PELAPOR DARI REPORT
    let pelaporFromReport = null;
    
    if (reportId) {
      const existingReport = await prisma.report.findUnique({
        where: { id: BigInt(reportId as string) },
        select: { latitude: true, longitude: true, pelapor: true }
      });

      if (existingReport) {
        taskLat = existingReport.latitude;
        taskLng = existingReport.longitude;
        pelaporFromReport = existingReport.pelapor ?? null;
      }

      const existingTask = await prisma.task.findFirst({
        where: { reportId: BigInt(reportId as string) }
      });

      if (existingTask) {
        return res.status(400).json({
          success: false,
          message: "Aduan ini sudah pernah dibuatkan penugasan sebelumnya."
        });
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const taskNumber = `ADUAN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await prisma.$transaction(async (tx) => {
      const truck = await tx.truck.findUnique({ where: { id: BigInt(truckId as string) } });
      if (!truck) throw new Error("Truk tidak ditemukan.");

      // ── Cek apakah truk BENAR-BENAR sedang bertugas (bukan cuma status BUSY yang nyangkut) ──
      if (truck.status === 'BUSY') {
        const truckActiveTask = await tx.task.findFirst({
          where: { truckId: truck.id, status: { not: 'SELESAI' } },
          orderBy: { scheduledAt: 'desc' }
        });

        const truckStillBusy = truckActiveTask ? isTaskTrulyActive(truckActiveTask) : false;

        if (truckStillBusy) {
          throw new Error("Armada ini sedang bertugas. Pilih armada lain atau tunggu sampai selesai.");
        }

        // Tugas lama sudah lewat jadwal -> sinkronkan status truk jadi tersedia
        await tx.truck.update({ where: { id: truck.id }, data: { status: 'AVAILABLE' } });
      }

      // ── Cek apakah supir BENAR-BENAR sedang sibuk (bukan cuma task lama yang overdue) ──
      const driverTasks = await tx.task.findMany({
        where: { driverId: BigInt(driverId as string), status: { not: 'SELESAI' } }
      });

      const driverStillBusy = driverTasks.some((t) => isTaskTrulyActive(t));

      if (driverStillBusy) {
        throw new Error("Supir ini sedang memiliki tugas aktif. Pilih supir lain atau tunggu sampai selesai.");
      }

      const newTask = await tx.task.create({
        data: {
          taskNumber,
          type: 'ADUAN',
          location,
          description: description || null,
          notes: notes || null,
          scheduledAt: new Date(scheduledAt),
          driverId: BigInt(driverId),
          truckId: truckId ? BigInt(truckId) : null,
          reportId: reportId ? BigInt(reportId) : null,
          pelapor: pelaporFromReport, // 🔥 FIELD PELAPOR
        }
      });

      if (reportId) {
        await tx.report.update({ where: { id: BigInt(reportId as string) }, data: { status: 'DITINDAKLANJUTI' } });
      }

      return newTask;
    });

    return res.status(201).json({ 
      success: true, 
      data: { ...result, id: result.id.toString() } 
    });

  } catch (error: any) {
    console.error("ERROR CREATE ADUAN:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: "Gagal: Nomor tugas atau ID laporan duplikat." });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Ambil Semua Data Penugasan ─────────────────────────────────
export const getSemuaPenugasan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type, status, driverId } = req.query;
    let whereClause: any = {};

    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (driverId) whereClause.driverId = BigInt(driverId as string);

    const driverIdBigInt = driverId ? BigInt(driverId as string) : null;

    if (driverIdBigInt) {
      const hariIni = getNamaHariIni();

      const truck = await prisma.truck.findFirst({ where: { operatorId: driverIdBigInt } });

      if (truck) {
        const routeTemplate = await prisma.routeTemplate.findFirst({
          where: { truckId: truck.id, dayOfWeek: hariIni, isActive: true },
          include: { waypoints: { orderBy: { order: 'asc' } } }
        });

        if (routeTemplate && routeTemplate.waypoints.length > 0) {
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
          const taskNumber = `RUTE-${truck.id}-${dateStr}`;

          const existingTask = await prisma.task.findUnique({ where: { taskNumber } });

          if (!existingTask) {
            const firstWp = routeTemplate.waypoints[0];
            await prisma.task.create({
              data: {
                taskNumber,
                type: 'RUTE',
                status: 'DITUGASKAN',
                location: routeTemplate.name,
                latitude: firstWp.latitude,
                longitude: firstWp.longitude,
                scheduledAt: new Date(),
                driverId: driverIdBigInt,
                truckId: truck.id,
              }
            });
          }
        }
      }
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        driver: { select: { id: true, fullName: true } },
        truck:  { select: { id: true, plateNumber: true } },
        report: { select: { id: true, description: true, pelapor: true } }
      },
      orderBy: driverIdBigInt ? { scheduledAt: 'desc' } : { createdAt: 'desc' }
    });

    const formattedTasks = tasks.map(task => ({
      ...task,
      id: task.id?.toString(),
      driverId: task.driverId?.toString() || null,
      truckId: task.truckId?.toString() || null,
      reportId: task.reportId?.toString() || null,
      assignerId: task.assignerId?.toString() || null,
      pelapor: task.pelapor || task.report?.pelapor || null, // 🔥 PRIORITASKAN DARI TASK
      driver: task.driver ? { 
        ...task.driver, 
        id: task.driver.id.toString() 
      } : null,
      truck: task.truck ? { 
        ...task.truck, 
        id: task.truck.id.toString() 
      } : null,
      report: task.report ? { 
        ...task.report, 
        id: task.report.id.toString() 
      } : null,
    }));

    return res.status(200).json({ success: true, data: formattedTasks });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};