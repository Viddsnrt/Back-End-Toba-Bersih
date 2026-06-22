import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    console.log('[Dashboard] Fetching stats...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalLaporan,
      laporanPending,
      laporanSelesai,
      laporanDiproses,
      totalTruk,
      trukAktif,
      penugasanStats,
      reportLast7Days,
      laporanSelesaiByLocation,
      firstReport
    ] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.report.count({ where: { status: 'SELESAI' } }),
      prisma.report.count({ where: { status: 'DITINDAKLANJUTI' } }),
      prisma.truck.count(),
      prisma.truck.count({ where: { status: 'AVAILABLE' } }),
      prisma.task.groupBy({ by: ['type'], _count: true }),
      prisma.report.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true }
      }),
      // ✅ Fix: hapus select location — tidak ada relasi location di Report schema
      // Gunakan field yang ada seperti description atau pelapor
      prisma.report.findMany({
        where: { status: 'SELESAI' },
        select: { description: true }
      }),
      prisma.report.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      })
    ]);

    const totalAduan = penugasanStats.find((p) => p.type === 'ADUAN')?._count || 0;
    const totalRutin = penugasanStats.find((p) => p.type === 'RUTIN')?._count || 0;

    // Grafik 7 hari terakhir
    const grafikMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().slice(0, 10);
      grafikMap.set(key, 0);
    }

    for (const report of reportLast7Days) {
      const day = new Date(report.createdAt);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().slice(0, 10);
      if (grafikMap.has(key)) {
        grafikMap.set(key, (grafikMap.get(key) || 0) + 1);
      }
    }

    const laporanPerHari = Array.from(grafikMap.entries()).map(([tanggal, total]) => ({
      tanggal,
      total
    }));

    // ✅ Fix: karena location tidak ada, grouping berdasarkan description sebagai wilayah
    // Atau tampilkan semua sebagai 'Tanpa Wilayah' jika description tidak relevan
    const wilayahMap = new Map<string, number>();
    for (const row of laporanSelesaiByLocation) {
      // Ambil kata pertama dari description sebagai label wilayah, atau 'Tanpa Wilayah'
      const wilayahName = row.description
        ? row.description.slice(0, 30)
        : 'Tanpa Wilayah';
      wilayahMap.set(wilayahName, (wilayahMap.get(wilayahName) || 0) + 1);
    }

    const kinerjaWilayah = Array.from(wilayahMap.entries()).map(([district, count]) => ({
      district,
      _count: count
    }));

    let rataLaporanBulanan = 0;
    if (firstReport) {
      const monthDiff = Math.ceil(
        (new Date().getTime() - new Date(firstReport.createdAt).getTime()) /
        (1000 * 60 * 60 * 24 * 30)
      );
      rataLaporanBulanan = monthDiff > 0
        ? Number((totalLaporan / monthDiff).toFixed(1))
        : totalLaporan;
    }

    res.json({
      success: true,
      data: {
        cards: {
          totalLaporan,
          laporanPending,
          laporanSelesai,
          laporanDiproses,
          totalTruk,
          trukAktif,
          totalAduan,
          totalRutin,
          rataLaporanBulanan
        },
        grafik: laporanPerHari,
        kinerjaWilayah
      }
    });
  } catch (error) {
    console.error('[Dashboard] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};