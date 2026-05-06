import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// Buat Tugas Rutin
export const createRutin = async (req: Request, res: Response): Promise<any> => {
  try {
    const { driverId, truckId, scheduledAt, location, notes, latitude, longitude } = req.body;

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const taskNumber = `RUTIN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTask = await prisma.task.create({
      data: {
        taskNumber,
        type: 'RUTIN',
        location,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        scheduledAt: new Date(scheduledAt),
        notes: notes || null,
        driverId: driverId ? BigInt(driverId) : null,
        truckId: truckId ? BigInt(truckId) : null,
      }
    });

    return res.status(201).json({ 
      success: true, 
      data: { 
        ...newTask, 
        id: newTask.id.toString(),
        driverId: newTask.driverId?.toString() || null,
        truckId: newTask.truckId?.toString() || null
      } 
    });
  } catch (error: any) {
    console.error("ERROR CREATE RUTIN:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Buat Tugas Aduan
export const createAduan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reportId, driverId, truckId, scheduledAt, location, district, description, notes } = req.body;

    // 1. VALIDASI: Cek apakah laporan ini sudah punya penugasan
    let reportData = null;
    
    if (reportId) {
      const existingTask = await prisma.task.findFirst({
        where: { reportId: BigInt(reportId) }
      });

      if (existingTask) {
        return res.status(400).json({ 
          success: false, 
          message: "Aduan ini sudah pernah dibuatkan penugasan sebelumnya." 
        });
      }

      // Ambil latitude & longitude dari laporan warga untuk diteruskan ke HP supir!
      reportData = await prisma.report.findUnique({
         where: { id: BigInt(reportId) }
      });
    }

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const taskNumber = `ADUAN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 2. TRANSAKSI: Gunakan $transaction agar Create Task & Update Report sukses bersamaan
    const result = await prisma.$transaction(async (tx) => {
      const newTask = await tx.task.create({
        data: {
          taskNumber,
          type: 'ADUAN',
          location,
          district: district || null,
          description: description || null,
          notes: notes || null,
          scheduledAt: new Date(scheduledAt),
          driverId: driverId ? BigInt(driverId) : null,
          truckId: truckId ? BigInt(truckId) : null,
          reportId: reportId ? BigInt(reportId) : null,
          // Salin koordinat dari laporan warga agar navigasi supir akurat
          latitude: reportData?.latitude || null,
          longitude: reportData?.longitude || null,
        }
      });

      if (reportId) {
        await tx.report.update({
          where: { id: BigInt(reportId) },
          data: { status: 'DITINDAKLANJUTI' }
        });
      }

      return newTask;
    });

    return res.status(201).json({ 
      success: true, 
      data: { 
        ...result, 
        id: result.id.toString(),
        driverId: result.driverId?.toString() || null,
        truckId: result.truckId?.toString() || null,
        reportId: result.reportId?.toString() || null,
      } 
    });

  } catch (error: any) {
    console.error("ERROR CREATE ADUAN:", error);
    // Cek jika error datang dari Prisma unique constraint (P2002)
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        success: false, 
        message: "Gagal: Nomor tugas atau ID laporan duplikat." 
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Ambil Semua Data Penugasan
export const getSemuaPenugasan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { type, status } = req.query;
    let whereClause: any = {};

    if (type) whereClause.type = type;
    if (status) whereClause.status = status;

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        driver: { select: { id: true, fullName: true } },
        truck: { select: { id: true, plateNumber: true } },
        report: { select: { id: true, description: true } }
      },
      orderBy: { scheduledAt: 'desc' }
    });

    // Perlindungan super aman untuk menghindari error null saat dikonversi ke string
    const formattedTasks = tasks.map((task: any) => ({
      ...task,
      id: task.id.toString(),
      driverId: task.driverId ? task.driverId.toString() : null,
      truckId: task.truckId ? task.truckId.toString() : null,
      reportId: task.reportId ? task.reportId.toString() : null,
      driver: task.driver ? { ...task.driver, id: task.driver.id.toString() } : null,
      truck: task.truck ? { ...task.truck, id: task.truck.id.toString() } : null,
      report: task.report ? { ...task.report, id: task.report.id.toString() } : null,
    }));

    return res.status(200).json({ success: true, data: formattedTasks });
  } catch (error: any) {
    console.error("ERROR GET PENUGASAN:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 🔥 FITUR BARU: Update Status Tugas (Digunakan oleh HP Supir saat tekan "Selesai")
export const updateTaskStatus = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ success: false, message: "ID Tugas tidak valid" });
  }

  try {
    // 1. Update status tugas (Task)
    const updatedTask = await prisma.task.update({
      where: { id: BigInt(id) },
      data: { status }
    });

    // 2. Jika tugas ADUAN dan SELESAI, update juga Laporan Warganya menjadi SELESAI
    if (updatedTask.reportId && status === 'SELESAI') {
      await prisma.report.update({
        where: { id: updatedTask.reportId },
        data: { status: 'SELESAI' }
      });

      // Tembak Socket.io agar Web Admin langsung refresh secara real-time
      const io = req.app.get('io');
      if (io) {
        io.emit('status_laporan_berubah', {
          reportId: updatedTask.reportId.toString(),
          newStatus: 'SELESAI'
        });
      }
    }

    return res.json({
      success: true,
      message: "Status tugas berhasil diperbarui",
      data: {
        ...updatedTask,
        id: updatedTask.id.toString(),
        driverId: updatedTask.driverId?.toString() || null,
        truckId: updatedTask.truckId?.toString() || null,
        reportId: updatedTask.reportId?.toString() || null,
        assignerId: updatedTask.assignerId?.toString() || null,
      }
    });
  } catch (error: any) {
    console.error("ERROR UPDATE TASK STATUS:", error);
    return res.status(500).json({ success: false, message: "Gagal memperbarui status tugas" });
  }
};