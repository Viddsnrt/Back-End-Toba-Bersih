import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// 1. Mengambil Daftar Laporan Baru yang belum ditugaskan
export const getAvailableTasks = async (req: Request, res: Response): Promise<any> => {
  try {
    const reports = await prisma.report.findMany({
      where: {
        status: 'PENDING',
        task: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formattedReports = reports.map(report => ({
      ...report,
      id: report.id.toString(),
      userId: report.userId ? report.userId.toString() : null,
      // userId: report.userId.toString(),
    }));

    return res.status(200).json({ success: true, data: formattedReports });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Mengubah Status Ketersediaan Supir
export const toggleDriverStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const { driverId, isAvailable } = req.body;

    const updatedDriver = await prisma.user.update({
      where: { id: BigInt(driverId) },
      data: { isActive: isAvailable },
    });

    const { passwordHash: _, ...safeDriverData } = updatedDriver;

    return res.status(200).json({
      success: true,
      message: 'Status berhasil diperbarui',
      data: {
        ...safeDriverData,
        id: safeDriverData.id.toString()
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Mengambil tugas khusus untuk supir yang sedang login
export const getDriverTasks = async (req: Request, res: Response): Promise<any> => {
  try {
    // FIX: driverId dari req.params bisa berupa string[], jadi cast ke string dulu
    const driverIdRaw = req.params.driverId;
    const driverIdStr = Array.isArray(driverIdRaw) ? driverIdRaw[0] : driverIdRaw;

    const tasks = await prisma.task.findMany({
      where: {
        driverId: BigInt(driverIdStr),
      },
      include: {
        truck: { select: { plateNumber: true } },
        report: { select: { id: true, description: true } }
      },
      // FIX: 'scheduledAt' tidak ada di schema Task kamu
      // Ganti dengan field yang ada, misalnya 'createdAt'
      orderBy: { createdAt: 'asc' }
    });

    const formattedTasks = tasks.map(task => ({
      ...task,
      id: task.id.toString(),
      driverId: task.driverId ? task.driverId.toString() : null,
      truckId: task.truckId ? task.truckId.toString() : null,
      reportId: task.reportId ? task.reportId.toString() : null,
    }));

    return res.status(200).json({ success: true, data: formattedTasks });
  } catch (error: any) {
    console.error("ERROR FETCH DRIVER TASKS:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};