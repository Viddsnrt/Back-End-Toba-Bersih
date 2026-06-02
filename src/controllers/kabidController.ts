import type { Request, Response } from 'express';
import { prisma, supabase } from '../config/db.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// ══════════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD KINERJA
// ══════════════════════════════════════════════════════════════════════════════
export const getDashboardKinerja = async (req: Request, res: Response) => {
  try {
    const totalLaporan    = await prisma.report.count();
    const laporanSelesai  = await prisma.report.count({ where: { status: 'SELESAI' } });
    const laporanDiproses = await prisma.report.count({
      where: { status: { in: ['PENDING', 'DITINDAKLANJUTI'] } },
    });
    const armadaAktif = await prisma.truck.count({ where: { status: 'BUSY' } });

    // Hotspot: kecamatan dengan PENDING terbanyak
    const hotspotSampah = await prisma.report.groupBy({
      by: ['district'],
      where: { status: 'PENDING' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    // Laporan 7 hari terakhir (per hari)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const laporanMingguan = await prisma.report.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { id: true },
    });

    // Performa armada: top 5 driver berdasarkan tugas selesai
    const performaArmada = await prisma.task.groupBy({
      by: ['driverId'],
      where: { status: 'SELESAI' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    // Wilayah aduan tertinggi (semua status)
    const wilayahAduanTertinggi = await prisma.report.groupBy({
      by: ['district'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    // Wilayah lambat: PENDING > 3 hari
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const wilayahLambat = await prisma.report.groupBy({
      by: ['district'],
      where: { status: 'PENDING', createdAt: { lt: threeDaysAgo } },
      _count: { id: true },
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
          hotspotSampah,
        },
        grafik: { laporanMingguan, performaArmada },
        ringkasanWilayah: { wilayahAduanTertinggi, wilayahLambat },
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
          orderBy: { scheduledAt: 'asc' },
        },
      },
    });

    const totalArmada = armada.length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const totalPerjalananHariIni = await prisma.task.count({
      where: {
        scheduledAt: { gte: todayStart },
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

    return res.json({
      success: true,
      data: {
        armada: armada.map((t) => ({
          id: t.id.toString(),
          plateNumber: t.plateNumber,
          status: t.status,
          currentLat: t.currentLat?.toString() ?? null,
          currentLong: t.currentLong?.toString() ?? null,
          lastPing: t.lastPing,
          lastLocation: t.lastLocation,
          sopir: t.operator?.fullName ?? null,
          telepon: t.operator?.phoneNumber ?? null,
          tugasAktif: t.tasks[0]
            ? {
                id: t.tasks[0].id.toString(),
                location: t.tasks[0].location,
                scheduledAt: t.tasks[0].scheduledAt,
              }
            : null,
        })),
        statistik: { totalArmada, totalPerjalananHariIni, rataRataRitase, armadaPalingAktif },
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
    // Laporan per wilayah
const laporanPerWilayah = await prisma.location.findMany({
  where: {
    locationType: 'KECAMATAN',
  },
  select: {
    name: true,
    _count: {
      select: {
        reports: true,
      },
    },
  },
});

    // Kategori terbanyak
    const kategoriTerbanyak = await prisma.report.groupBy({
      by: ['jenisSampah'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Tren 12 bulan terakhir
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const trenBulanan = await prisma.report.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: twelveMonthsAgo } },
      _count: { id: true },
    });

    // Rata-rata waktu respon (jam)
    const laporanSelesai = await prisma.report.findMany({
      where: { status: 'SELESAI' },
      select: { createdAt: true, updatedAt: true },
    });
    const totalWaktu = laporanSelesai.reduce((sum, l) => {
      return sum + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime());
    }, 0);
    const rataWaktuRespon =
      laporanSelesai.length > 0
        ? Math.round(totalWaktu / laporanSelesai.length / (1000 * 60 * 60))
        : 0;

    const totalLaporan = await prisma.report.count();
    const tingkatPenyelesaian =
      totalLaporan > 0 ? ((laporanSelesai.length / totalLaporan) * 100).toFixed(1) : '0';

    const performaWilayah = await prisma.report.groupBy({
      by: ['district'],
      where: { status: 'SELESAI' },
      _count: { id: true },
    });

    // ✅ PERBAIKAN: Ambil semua data dulu, lalu filter manual
    const semuaTitik = await prisma.report.findMany({
      select: {
        id: true,
        latitude: true,
        longitude: true,
        status: true,
        jenisSampah: true,
        district: true,
      },
    });

    // Filter manual untuk latitude/longitude yang valid
    const titikAduan = semuaTitik.filter(t => {
      const lat = t.latitude ? Number(t.latitude) : 0;
      const lng = t.longitude ? Number(t.longitude) : 0;
      return lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);
    });

    return res.json({
      success: true,
      data: {
        statistikLaporan: { laporanPerWilayah, kategoriTerbanyak, trenBulanan },
        statistikOperasional: {
          rataWaktuRespon: `${rataWaktuRespon} jam`,
          tingkatPenyelesaian: `${tingkatPenyelesaian}%`,
          performaWilayah,
        },
        heatmap: titikAduan.map((t) => ({
          id: t.id.toString(),
          lat: t.latitude!.toString(),
          lng: t.longitude!.toString(),
          status: t.status,
          jenis: t.jenisSampah,
          district: t.district,
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
    const { status, district, startDate, endDate, jenisSampah } = req.query;

    const where: any = { latitude: { not: null }, longitude: { not: null } };
    if (status)      where.status      = status;
    if (district)    where.district    = district;
    if (jenisSampah) where.jenisSampah = jenisSampah;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate)   where.createdAt.lte = new Date(endDate   as string);
    }

    const titikAduan = await prisma.report.findMany({
      where,
      select: {
        id: true,
        description: true,
        latitude: true,
        longitude: true,
        status: true,
        jenisSampah: true,
        district: true,
        photoUrl: true,
        createdAt: true,
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
        titikAduan: titikAduan.map((t) => ({
          id: t.id.toString(),
          deskripsi: t.description,
          lat: t.latitude!.toString(),
          lng: t.longitude!.toString(),
          status: t.status,
          jenis: t.jenisSampah,
          kecamatan: t.district,
          foto: t.photoUrl,
          waktu: t.createdAt,
        })),
        kecamatan: kecamatanList.map((k) => ({
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

    // ── a) Aduan ──
    if (type === 'aduan') {
      const where: any = {};
      if (startDate) where.createdAt = { gte: new Date(startDate) };
      if (endDate)   where.createdAt = { ...where.createdAt, lte: new Date(endDate) };

      const aduan = await prisma.report.findMany({
        where,
        include: { 
          user: { select: { fullName: true } },
          location: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
      });
      data = aduan.map((a) => ({
        'ID Laporan':    a.id.toString(),
        'Pelapor':       a.user?.fullName ?? a.pelapor ?? '-',
        'Email Pelapor': a.email ?? '-',
        'Jenis Sampah':  a.jenisSampah   ?? '-',
        'Deskripsi':     a.description ?? '-',
        'Lokasi':        a.location?.name ?? '-',
        'Status':        a.status,
        'Waktu Lapor':   new Date(a.createdAt).toLocaleString('id-ID'),
        'Waktu Selesai': a.status === 'SELESAI' ? new Date(a.updatedAt).toLocaleString('id-ID') : '-',
      }));
      filename = `rekap_aduan_${new Date().toISOString().slice(0, 10)}`;
    }

    // ── b) Armada ──
    else if (type === 'armada') {
      const taskWhere: any = { status: 'SELESAI' };
      if (startDate && endDate) {
        taskWhere.scheduledAt = { gte: new Date(startDate), lte: new Date(endDate) };
      }
      const armada = await prisma.truck.findMany({
        include: {
          operator: { select: { fullName: true } },
          tasks: { where: taskWhere },
        },
      });
      data = armada.map((a) => ({
        'Plat Nomor':    a.plateNumber,
        'Supir':         a.operator?.fullName ?? '-',
        'Status':        a.status,
        'Total Tugas':   a.tasks.length,
        'Total Volume (kg)': a.tasks.reduce((s, t) => s + (Number(t.volumeKg) || 0), 0),
        'Last Ping':     a.lastPing ? new Date(a.lastPing).toLocaleString('id-ID') : '-',
      }));
      filename = `rekap_armada_${new Date().toISOString().slice(0, 10)}`;
    }

    // ── c) Wilayah ──
    else if (type === 'wilayah') {
      const reportWhere: any = {};
      if (startDate && endDate) {
        reportWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
      }
      const wilayah = await prisma.location.findMany({
        where: { locationType: 'KECAMATAN' },
        include: { reports: { where: reportWhere } },
      });
      data = wilayah.map((w) => ({
        'Kecamatan':        w.name,
        'Kode':             w.code        ?? '-',
        'Total Laporan':    w.reports.length,
        'Laporan Selesai':  w.reports.filter((r) => r.status === 'SELESAI').length,
        'Laporan Pending':  w.reports.filter((r) => r.status === 'PENDING').length,
        'Populasi':         w.population  ?? '-',
      }));
      filename = `rekap_wilayah_${new Date().toISOString().slice(0, 10)}`;
    }

    // ── d) Supir (Driver) ──
    else if (type === 'supir') {
      const userWhere: any = { role: 'OPERATOR' };
      if (startDate && endDate) {
        userWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
      }
      const supir = await prisma.user.findMany({
        where: userWhere,
        include: {
          tasks: {
            where: startDate && endDate ? { scheduledAt: { gte: new Date(startDate), lte: new Date(endDate) } } : {},
          },
        },
        orderBy: { fullName: 'asc' },
      });
      data = supir.map((s) => ({
        'Nama Supir':      s.fullName ?? '-',
        'Email':           s.email ?? '-',
        'No. Telepon':     s.phoneNumber ?? '-',
        'Status':          s.isActive ? 'Aktif' : 'Tidak Aktif',
        'Total Tugas':     s.tasks.length,
        'Tugas Selesai':   s.tasks.filter((t) => t.status === 'SELESAI').length,
        'Waktu Bergabung': s.createdAt ? new Date(s.createdAt).toLocaleDateString('id-ID') : '-',
      }));
      filename = `rekap_supir_${new Date().toISOString().slice(0, 10)}`;
    }

    // ── e) Rute (Route) ──
    else if (type === 'rute') {
      const ruteWhere: any = {};
      if (startDate && endDate) {
        ruteWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
      }
      const rute = await prisma.routeTemplate.findMany({
        where: ruteWhere,
        include: {
          truck: { select: { plateNumber: true } },
          waypoints: true,
        },
        orderBy: { name: 'asc' },
      });
      data = rute.map((r) => ({
        'Nama Rute':       r.name,
        'Hari':            r.dayOfWeek ?? '-',
        'Plat Truk':       r.truck?.plateNumber ?? '-',
        'Status':          r.isActive ? 'Aktif' : 'Tidak Aktif',
        'Total Waypoint':  r.waypoints?.length ?? 0,
        'Waktu Dibuat':    r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID') : '-',
      }));
      filename = `rekap_rute_${new Date().toISOString().slice(0, 10)}`;
    } else {
      return res.status(400).json({ success: false, message: 'Jenis laporan tidak valid' });
    }

    if (data.length === 0) {
      return res.status(404).json({ success: false, message: 'Tidak ada data untuk diekspor' });
    }

    // ── Format Excel ──
    if (format === 'excel') {
      const workbook  = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Rekapitulasi');

      const headers = Object.keys(data[0]);
      worksheet.columns = headers.map((key) => ({ header: key, key, width: 22 }));

      // Style header
      worksheet.getRow(1).eachCell((cell) => {
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16a34a' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      worksheet.addRows(data);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    // ── Format PDF ──
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      doc.pipe(res);

      // Header PDF
      doc.fontSize(18).font('Helvetica-Bold').text('Laporan Rekapitulasi CleanCity', { align: 'center' });
      doc.fontSize(11).font('Helvetica').text(`Jenis: ${type.toUpperCase()}`, { align: 'center' });
      doc.fontSize(9).text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, { align: 'right' });
      doc.moveDown(1.5);

      const headers     = Object.keys(data[0]);
      const pageWidth   = doc.page.width - 100;
      const colWidth    = pageWidth / headers.length;
      let   currentTop  = doc.y;

      // Header tabel
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.rect(50 + i * colWidth, currentTop, colWidth, 18).fillAndStroke('#16a34a', '#16a34a');
        doc.fillColor('white').text(h, 52 + i * colWidth, currentTop + 4, { width: colWidth - 4 });
      });
      currentTop += 20;

      // Baris data
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
    });

    return res.json({
      success: true,
      data: {
        kecamatan:    kecamatan.map((k) => k.name),
        status:       ['PENDING', 'DITINDAKLANJUTI', 'SELESAI'],
        jenisSampah:  ['ORGANIK', 'ANORGANIK', 'B3', 'CAMPURAN'],
      },
    });
  } catch (error) {
    console.error('getFilterOptions:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data filter' });
  }
};