import type { Request, Response } from 'express';
import { prisma, supabase } from '../config/db.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// ══════════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD KINERJA
// ══════════════════════════════════════════════════════════════════════════════
export const getDashboardKinerja = async (req: Request, res: Response) => {
  try {
    const totalLaporan = await prisma.report.count();
    const laporanSelesai = await prisma.report.count({ where: { status: 'SELESAI' } });
    const laporanDiproses = await prisma.report.count({
      where: { status: { in: ['PENDING', 'DITINDAKLANJUTI'] } },
    });
    const armadaAktif = await prisma.truck.count({ where: { status: 'BUSY' } });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const laporanMingguan = await prisma.report.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    });

    const laporanPerHariMap = new Map<string, number>();
    laporanMingguan.forEach(l => {
      const tanggal = l.createdAt.toISOString().split('T')[0];
      laporanPerHariMap.set(tanggal, (laporanPerHariMap.get(tanggal) || 0) + 1);
    });

    const laporanMingguanFormatted = Array.from(laporanPerHariMap.entries()).map(([tanggal, jumlah]) => ({
      tanggal,
      jumlah,
    }));

    const performaArmada = await prisma.task.groupBy({
      by: ['driverId'],
      where: { status: 'SELESAI' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const hotspotSampah = await prisma.report.findMany({
      where: { status: { in: ['PENDING', 'DITINDAKLANJUTI'] } },
      select: { id: true, latitude: true, longitude: true, description: true, pelapor: true },
      take: 10,
    });

    return res.json({
      success: true,
      data: {
        statistik: {
          totalLaporan,
          laporanSelesai,
          laporanDiproses,
          armadaAktif,
          hotspotCount: hotspotSampah.length,
          hotspotSampah: hotspotSampah.map(h => ({
            id: h.id.toString(),
            lat: Number(h.latitude),
            lng: Number(h.longitude),
            deskripsi: h.description,
            pelapor: h.pelapor,
          })),
        },
        grafik: {
          laporanMingguan: laporanMingguanFormatted,
          performaArmada: performaArmada.map(p => ({
            driverId: p.driverId,
            totalSelesai: p._count.id,
          })),
        },
        ringkasanWilayah: {
          wilayahAduanTertinggi: [],
          wilayahLambat: [],
        },
      },
    });
  } catch (error) {
    console.error('getDashboardKinerja:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data dashboard' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. MONITORING ARMADA
// ══════════════════════════════════════════════════════════════════════════════
export const getMonitoringArmada = async (req: Request, res: Response) => {
  try {
    const armada = await prisma.truck.findMany({
      where: {
        OR: [{ status: 'BUSY' }, { operatorId: { not: null } }],
      },
      include: {
        operator: { select: { fullName: true, phoneNumber: true } },
        tasks: {
          where: { status: { not: 'SELESAI' } },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const totalArmada = armada.length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const totalPerjalananHariIni = await prisma.task.count({
      where: {
        createdAt: { gte: todayStart },
        status: { in: ['DITERIMA', 'DALAM_PERJALANAN', 'TIBA', 'BEKERJA', 'SELESAI'] },
      },
    });

    const totalTugasSelesai = await prisma.task.count({ where: { status: 'SELESAI' } });
    const rataRataRitase = totalArmada > 0 ? Math.round(totalTugasSelesai / totalArmada) : 0;

    const armadaPalingAktif = await prisma.task.groupBy({
      by: ['truckId'],
      where: { status: 'SELESAI' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const truckDetails = await prisma.truck.findMany({
      where: { id: { in: armadaPalingAktif.map(a => a.truckId!).filter(Boolean) } },
      select: { id: true, plateNumber: true },
    });

    return res.json({
      success: true,
      data: {
        armada: armada.map((t) => ({
          id: t.id.toString(),
          plateNumber: t.plateNumber,
          status: t.status,
          currentLat: t.currentLat ? Number(t.currentLat) : null,
          currentLong: t.currentLong ? Number(t.currentLong) : null,
          lastPing: t.lastPing,
          sopir: t.operator?.fullName ?? null,
          telepon: t.operator?.phoneNumber ?? null,
          tugasAktif: t.tasks[0]
            ? { id: t.tasks[0].id.toString(), location: t.tasks[0].location, createdAt: t.tasks[0].createdAt }
            : null,
        })),
        statistik: {
          totalArmada,
          totalPerjalananHariIni,
          rataRataRitase,
          armadaPalingAktif: armadaPalingAktif.map(a => ({
            truckId: a.truckId,
            truckPlate: truckDetails.find(t => t.id === a.truckId)?.plateNumber || '-',
            totalTugas: a._count.id,
          })),
        },
      },
    });
  } catch (error) {
    console.error('getMonitoringArmada:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data monitoring armada' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. STATISTIK & ANALITIK
// ══════════════════════════════════════════════════════════════════════════════
export const getStatistikOperasional = async (req: Request, res: Response) => {
  try {
    // FIX: Report tidak punya locationId, dan Location tidak punya relasi ke Report.
    // Gunakan field 'district' dari Task untuk statistik per wilayah.
    const semuaTask = await prisma.task.findMany({
      select: { district: true, status: true },
      where: { district: { not: null } },
    });

    const wilayahMap = new Map<string, number>();
    for (const task of semuaTask) {
      const nama = task.district ?? 'Tanpa Wilayah';
      wilayahMap.set(nama, (wilayahMap.get(nama) || 0) + 1);
    }

    const laporanPerWilayah = Array.from(wilayahMap.entries()).map(([nama, totalLaporan]) => ({
      nama,
      totalLaporan,
    }));

    const laporanSetahun = await prisma.report.findMany({
      where: {
        createdAt: {
          gte: new Date(new Date().setMonth(new Date().getMonth() - 11)),
        },
      },
      select: { createdAt: true },
    });

    const trenBulanan = Array.from({ length: 12 }, (_, i) => {
      const bulan = new Date();
      bulan.setMonth(bulan.getMonth() - i);
      const bulanName = bulan.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      const count = laporanSetahun.filter(l =>
        l.createdAt.getMonth() === bulan.getMonth() &&
        l.createdAt.getFullYear() === bulan.getFullYear()
      ).length;
      return { bulan: bulanName, jumlah: count };
    }).reverse();

    const laporanSelesai = await prisma.report.findMany({
      where: { status: 'SELESAI' },
      select: { createdAt: true, updatedAt: true },
    });

    const totalWaktu = laporanSelesai.reduce((sum, l) => {
      return sum + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime());
    }, 0);
    const rataWaktuRespon = laporanSelesai.length > 0
      ? Math.round(totalWaktu / laporanSelesai.length / (1000 * 60 * 60))
      : 0;

    const totalLaporan = await prisma.report.count();
    const tingkatPenyelesaian = totalLaporan > 0
      ? ((laporanSelesai.length / totalLaporan) * 100).toFixed(1)
      : '0';

    const semuaTitik = await prisma.report.findMany({
      select: { id: true, latitude: true, longitude: true, status: true },
    });

    return res.json({
      success: true,
      data: {
        statistikLaporan: {
          laporanPerWilayah,
          trenBulanan,
        },
        statistikOperasional: {
          rataWaktuRespon: `${rataWaktuRespon} jam`,
          tingkatPenyelesaian: `${tingkatPenyelesaian}%`,
          performaWilayah: [],
        },
        heatmap: semuaTitik.map(t => ({
          id: t.id.toString(),
          lat: Number(t.latitude),
          lng: Number(t.longitude),
          status: t.status,
        })),
      },
    });
  } catch (error) {
    console.error('getStatistikOperasional:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data statistik' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. PETA PERSEBARAN ADUAN
// ══════════════════════════════════════════════════════════════════════════════
export const getPetaAduan = async (req: Request, res: Response) => {
  try {
    const { status, startDate, endDate } = req.query;
    const where: any = {};

    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const titikAduan = await prisma.report.findMany({
      where,
      select: {
        id: true, description: true, latitude: true, longitude: true,
        status: true, photoUrl: true, createdAt: true, pelapor: true, email: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const kecamatanList = await prisma.location.findMany({
      where: { locationType: 'KECAMATAN' },
      select: { name: true, code: true, latitude: true, longitude: true },
    });

    return res.json({
      success: true,
      data: {
        titikAduan: titikAduan.map(t => ({
          id: t.id.toString(),
          deskripsi: t.description,
          lat: Number(t.latitude),
          lng: Number(t.longitude),
          status: t.status,
          pelapor: t.pelapor,
          email: t.email,
          foto: t.photoUrl,
          waktu: t.createdAt,
        })),
        kecamatan: kecamatanList.map(k => ({
          name: k.name,
          code: k.code,
          center: [Number(k.latitude), Number(k.longitude)],
        })),
      },
    });
  } catch (error) {
    console.error('getPetaAduan:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data peta aduan' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. EXPORT REKAPITULASI (PDF / Excel)
// ══════════════════════════════════════════════════════════════════════════════
export const exportRekapLaporan = async (req: Request, res: Response) => {
  try {
    const { type, format, startDate, endDate } = req.body;
    let data: Record<string, any>[] = [];
    let filename = '';

    if (type === 'aduan') {
      const where: any = {};
      if (startDate) where.createdAt = { gte: new Date(startDate) };
      if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(endDate) };

      const aduan = await prisma.report.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      });

      data = aduan.map(a => ({
        'ID Laporan': a.id.toString(),
        'Pelapor': a.user?.fullName ?? a.pelapor ?? '-',
        'Email Pelapor': a.email ?? '-',
        'Deskripsi': a.description ?? '-',
        'Status': a.status,
        'Waktu Lapor': new Date(a.createdAt).toLocaleString('id-ID'),
        'Waktu Selesai': a.status === 'SELESAI' ? new Date(a.updatedAt).toLocaleString('id-ID') : '-',
      }));
      filename = `rekap_aduan_${new Date().toISOString().slice(0, 10)}`;

    } else if (type === 'armada') {
      const armada = await prisma.truck.findMany({
        include: {
          operator: { select: { fullName: true } },
          tasks: { where: { status: 'SELESAI' } },
        },
      });

      data = armada.map(a => ({
        'Plat Nomor': a.plateNumber,
        'Supir': a.operator?.fullName ?? '-',
        'Status': a.status,
        'Total Tugas': a.tasks.length,
        'Last Ping': a.lastPing ? new Date(a.lastPing).toLocaleString('id-ID') : '-',
      }));
      filename = `rekap_armada_${new Date().toISOString().slice(0, 10)}`;

    } else if (type === 'wilayah') {
      // FIX: Report tidak punya locationId, Location tidak punya relasi ke Report.
      // Gunakan field 'district' dari Task untuk rekap per wilayah.
      const semuaTask = await prisma.task.findMany({
        select: { district: true, status: true },
      });

      const wilayahMap = new Map<string, { total: number; selesai: number; pending: number }>();
      for (const task of semuaTask) {
        const nama = task.district ?? 'Tanpa Wilayah';
        const existing = wilayahMap.get(nama) ?? { total: 0, selesai: 0, pending: 0 };
        existing.total += 1;
        if (task.status === 'SELESAI') existing.selesai += 1;
        if (task.status === 'DITUGASKAN') existing.pending += 1;
        wilayahMap.set(nama, existing);
      }

      data = Array.from(wilayahMap.entries()).map(([nama, stat]) => ({
        'Kecamatan': nama,
        'Total Tugas': stat.total,
        'Tugas Selesai': stat.selesai,
        'Tugas Pending': stat.pending,
      }));
      filename = `rekap_wilayah_${new Date().toISOString().slice(0, 10)}`;

    } else if (type === 'supir') {
      const supir = await prisma.user.findMany({
        where: { role: 'OPERATOR' },
        include: { tasks: true },
        orderBy: { fullName: 'asc' },
      });

      data = supir.map(s => ({
        'Nama Supir': s.fullName ?? '-',
        'Email': s.email ?? '-',
        'No. Telepon': s.phoneNumber ?? '-',
        'Status': s.isActive ? 'Aktif' : 'Tidak Aktif',
        'Total Tugas': s.tasks.length,
        'Tugas Selesai': s.tasks.filter(t => t.status === 'SELESAI').length,
        'Waktu Bergabung': s.createdAt ? new Date(s.createdAt).toLocaleDateString('id-ID') : '-',
      }));
      filename = `rekap_supir_${new Date().toISOString().slice(0, 10)}`;

    } else if (type === 'rute') {
      const rute = await prisma.routeTemplate.findMany({
        include: {
          truck: { select: { plateNumber: true } },
          waypoints: true,
        },
        orderBy: { name: 'asc' },
      });

      data = rute.map(r => ({
        'Nama Rute': r.name,
        'Hari': r.dayOfWeek ?? '-',
        'Plat Truk': r.truck?.plateNumber ?? '-',
        'Status': r.isActive ? 'Aktif' : 'Tidak Aktif',
        'Total Waypoint': r.waypoints?.length ?? 0,
        'Waktu Dibuat': r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID') : '-',
      }));
      filename = `rekap_rute_${new Date().toISOString().slice(0, 10)}`;

    } else {
      return res.status(400).json({ success: false, message: 'Jenis laporan tidak valid' });
    }

    if (data.length === 0) {
      return res.status(404).json({ success: false, message: 'Tidak ada data untuk diekspor' });
    }

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Rekapitulasi');

      const headers = Object.keys(data[0]);
      worksheet.columns = headers.map(key => ({ header: key, key, width: 22 }));

      worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16a34a' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      worksheet.addRows(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      doc.pipe(res);

      doc.fontSize(18).font('Helvetica-Bold').text('Laporan Rekapitulasi Toba Bersih', { align: 'center' });
      doc.fontSize(11).font('Helvetica').text(`Jenis: ${type.toUpperCase()}`, { align: 'center' });
      doc.fontSize(9).text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, { align: 'right' });
      doc.moveDown(1.5);

      const headers = Object.keys(data[0]);
      const pageWidth = doc.page.width - 100;
      const colWidth = pageWidth / headers.length;
      let currentTop = doc.y;

      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.rect(50 + i * colWidth, currentTop, colWidth, 18).fillAndStroke('#16a34a', '#16a34a');
        doc.fillColor('white').text(h, 52 + i * colWidth, currentTop + 4, { width: colWidth - 4 });
      });
      currentTop += 20;

      doc.font('Helvetica').fontSize(7).fillColor('black');
      data.forEach((row, rowIdx) => {
        if (currentTop > doc.page.height - 80) {
          doc.addPage({ layout: 'landscape' });
          currentTop = 50;
        }
        const bgColor = rowIdx % 2 === 0 ? '#f0fdf4' : '#ffffff';
        headers.forEach((h, i) => {
          doc.rect(50 + i * colWidth, currentTop, colWidth, 16).fillAndStroke(bgColor, '#e5e7eb');
          doc.fillColor('#111827').text(String(row[h] ?? '-'), 52 + i * colWidth, currentTop + 3, {
            width: colWidth - 4,
          });
        });
        currentTop += 17;
      });

      doc.end();
      return;
    }

    return res.status(400).json({ success: false, message: 'Format tidak valid. Gunakan excel atau pdf.' });
  } catch (error) {
    console.error('exportRekapLaporan:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengekspor laporan' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// 6. FILTER OPTIONS (dropdown)
// ══════════════════════════════════════════════════════════════════════════════
export const getFilterOptions = async (_req: Request, res: Response) => {
  try {
    const kecamatan = await prisma.location.findMany({
      where: { locationType: 'KECAMATAN' },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    return res.json({
      success: true,
      data: {
        kecamatan: kecamatan.map(k => k.name),
        status: ['PENDING', 'DITINDAKLANJUTI', 'SELESAI'],
      },
    });
  } catch (error) {
    console.error('getFilterOptions:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data filter' });
  }
};