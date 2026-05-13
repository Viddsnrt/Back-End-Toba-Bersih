import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// // Buat Tugas Rutin
// export const createRutin = async (req: Request, res: Response): Promise<any> => {
//   try {
//     const { driverId, truckId, scheduledAt, location, notes } = req.body;

//     const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
//     const taskNumber = `RUTIN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

//     const newTask = await prisma.task.create({
//       data: {
//         taskNumber,
//         type: 'RUTIN',
//         location,
//         scheduledAt: new Date(scheduledAt),
//         notes: notes || null,
//         driverId: BigInt(driverId),
//         truckId: truckId ? BigInt(truckId) : null,
//       }
//     });

//     return res.status(201).json({ success: true, data: { ...newTask, id: newTask.id.toString() } });
//   } catch (error: any) {
//     console.error("ERROR CREATE RUTIN:", error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// };

// Buat Tugas Aduan
export const createAduan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reportId, driverId, truckId, scheduledAt, location, district, description, notes } = req.body;

    // 1. VALIDASI: Cek apakah laporan ini sudah punya penugasan
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
          driverId: BigInt(driverId),
          truckId: truckId ? BigInt(truckId) : null,
          reportId: reportId ? BigInt(reportId) : null,
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
      data: { ...result, id: result.id.toString() } 
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

    // Formatting yang aman agar tidak kena "Cannot read properties of null (reading 'toString')"
    const formattedTasks = tasks.map(task => ({
      ...task,
      // Gunakan Optional Chaining (?.) untuk semua field BigInt
      id: task.id?.toString(),
      driverId: task.driverId?.toString() || null,
      truckId: task.truckId?.toString() || null,
      reportId: task.reportId?.toString() || null,
      assignerId: task.assignerId?.toString() || null,

      // Cek apakah relasi driver ada sebelum map id-nya
      driver: task.driver ? { 
        ...task.driver, 
        id: task.driver.id.toString() 
      } : null,

      // Cek apakah relasi truck ada
      truck: task.truck ? { 
        ...task.truck, 
        id: task.truck.id.toString() 
      } : null,

      // Cek apakah relasi report ada
      report: task.report ? { 
        ...task.report, 
        id: task.report.id.toString() 
      } : null,
    }));

    return res.status(200).json({ success: true, data: formattedTasks });
  } catch (error: any) {
    console.error("GET PENUGASAN ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};