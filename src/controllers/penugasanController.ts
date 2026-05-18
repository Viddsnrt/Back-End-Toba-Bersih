import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// Buat Tugas Aduan
export const createAduan = async (req: Request, res: Response): Promise<any> => {
  try {
    const { reportId, driverId, truckId, scheduledAt, location, district, description, notes } = req.body;

    if (!location) {
      return res.status(400).json({ 
        success: false, 
        message: "Field location wajib diisi." 
      });
    }

    // 🔥 AMBIL PELAPOR DARI REPORT
    let pelaporFromReport = null;
    
    if (reportId) {
      // Cek apakah sudah ada penugasan
      const existingTask = await prisma.task.findFirst({
        where: { reportId: BigInt(reportId) }
      });

      if (existingTask) {
        return res.status(400).json({ 
          success: false, 
          message: "Aduan ini sudah pernah dibuatkan penugasan sebelumnya." 
        });
      }
      
      // Ambil data pelapor dari report
      const report = await prisma.report.findUnique({
        where: { id: BigInt(reportId) },
        select: { pelapor: true }
      });
      
      pelaporFromReport = report?.pelapor;
    }

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const taskNumber = `ADUAN-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

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
          pelapor: pelaporFromReport, // 🔥 FIELD PELAPOR
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
        report: { select: { id: true, description: true, pelapor: true } }
      },
      orderBy: { scheduledAt: 'desc' }
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
    console.error("GET PENUGASAN ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};