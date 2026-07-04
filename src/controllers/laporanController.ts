import type { Request, Response } from 'express';
import { prisma, supabase } from '../config/db.js';
import { sendEmail } from '../utils/sendEmail.js';
import { validateWasteImage, QualityCheckError } from '../services/validationService.js';


// helper hitung jarak (haversine, dalam KM) — dipakai untuk cek geofencing
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // radius bumi dalam km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
// ============================================================
// GET SEMUA LAPORAN (Admin)
// ============================================================
export const getLaporan = async (req: Request, res: Response): Promise<any> => {
  try {
    const data = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            fullName: true,
            phoneNumber: true,
          },
        },
      },
    });

    // Konversi BigInt ke String dan Decimal ke Number agar JSON.stringify tidak error
    const formattedData = data.map((item: any) => ({
      ...item,
      id: item.id.toString(),
      userId: item.userId ? item.userId.toString() : null,
      latitude: item.latitude ? Number(item.latitude) : 0,
      longitude: item.longitude ? Number(item.longitude) : 0,
    }));

    return res.json({
      success: true,
      total: formattedData.length,
      data: formattedData,
    });
  } catch (error: any) {
    console.error('ERROR GET LAPORAN:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal ambil data',
      detail: error.message,
      code: error.code,
    });
  }
};

// ============================================================
// CREATE LAPORAN (Masyarakat)
// ============================================================
export const createLaporan = async (req: Request, res: Response): Promise<any> => {
  const { userId, description, deskripsi, latitude, longitude, photoUrl: bodyPhotoUrl, email, pelapor } = req.body;
  const file = req.file;

  try {
    // Validasi email jika masyarakat tidak login
    if (!userId || userId === '' || userId === null) {
      if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          message: '⚠️ Email tidak valid! Silakan masukkan email yang benar untuk pemberitahuan status laporan.',
        });
      }
    }

    // ✅ BARU: Validasi Wilayah (Geofencing)
    // Laporan hanya boleh dikirim jika lokasi pelapor berada di dalam radius
    // salah satu wilayah yang berstatus AKTIF.
    const pLat = parseFloat(latitude);
    const pLon = parseFloat(longitude);
    const hasValidCoords = !isNaN(pLat) && !isNaN(pLon) && !(pLat === 0 && pLon === 0);

    if (hasValidCoords) {
      const activeWilayah = await prisma.location.findMany({
        where: { isActive: true },
      });

      // Kalau belum ada wilayah aktif yang dikonfigurasi sama sekali,
      // jangan blokir laporan (anggap admin belum setup wilayah).
      if (activeWilayah.length > 0) {
        let isCovered = false;
        let nearest: { name: string; distance: number } | null = null;

        for (const w of activeWilayah) {
          const distance = calculateDistanceKm(pLat, pLon, Number(w.latitude), Number(w.longitude));
          const radiusKm = (w.radius || 5000) / 1000;

          if (distance <= radiusKm) {
            isCovered = true;
            break;
          }

          if (!nearest || distance < nearest.distance) {
            nearest = { name: w.name, distance };
          }
        }

        if (!isCovered) {
          const distanceText = nearest ? nearest.distance.toFixed(2) : '0';
          const namaWilayah = nearest ? nearest.name : 'wilayah aktif';

          return res.status(400).json({
            success: false,
            message: `Laporan tidak dapat dikirim karena lokasi Anda berada ${distanceText} km dari kecamatan aktif terdekat (${namaWilayah}). Silakan kirim laporan saat berada di dalam radius wilayah yang dilayani.`,
          });
        }
      }
    }

    // Cek user (opsional)
    let finalUserId: bigint | null = null;
    if (userId !== undefined && userId !== null && userId !== '' && !isNaN(Number(userId))) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
        if (userExists) finalUserId = BigInt(userId);
      } catch {
        finalUserId = null;
      }
    }

    // Upload foto ke Supabase
    let finalPhotoUrl = bodyPhotoUrl || null;
    let uploadedFileName: string | null = null;

    if (file) {
      const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
      const { error } = await supabase.storage
        .from('Foto-sampah')
        .upload(fileName, file.buffer, { contentType: file.mimetype });
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage
        .from('Foto-sampah')
        .getPublicUrl(fileName);
      finalPhotoUrl = publicUrlData.publicUrl;
      uploadedFileName = fileName;
    }

    // Validasi ML
    if (file && finalPhotoUrl) {
      try {
        const mlResult = await validateWasteImage(file.buffer, file.originalname);
        console.log(`[ML] Prediksi: ${mlResult.prediction.label} (${(mlResult.prediction.confidence * 100).toFixed(1)}%)`);

        if (mlResult.prediction.class === 0) {
          if (uploadedFileName) {
            await supabase.storage.from('Foto-sampah').remove([uploadedFileName]);
          }
          return res.status(422).json({
            success: false,
            message: `Foto sampah dinilai "Tidak Layak Diangkut" oleh sistem (confidence: ${(mlResult.prediction.confidence * 100).toFixed(0)}%). Silakan foto ulang dengan sudut yang lebih jelas.`,
            ml_result: mlResult,
          });
        }
      } catch (err) {
        if (err instanceof QualityCheckError) {
          console.log(`[ML] Quality check failed: ${err.rejection.reason}`);
          if (uploadedFileName) {
            await supabase.storage.from('Foto-sampah').remove([uploadedFileName]);
          }
          return res.status(422).json({
            success: false,
            message: err.rejection.reason,
            rejection_stage: err.rejection.rejection_stage,
            quality_details: err.rejection.quality_details,
          });
        }
        console.error('⚠️ ML validation error (non-blocking):', err);
      }
    }

    // Fallback userId
    let fallbackUserId = null;
    if (!finalUserId) {
      const fallbackUser = await prisma.user.findFirst({
        where: { role: { in: ['WARGA', 'ADMIN', 'OPERATOR'] }, isActive: true },
      });
      if (fallbackUser) fallbackUserId = fallbackUser.id;
    }

    // Simpan ke database
    const dataBaru = await prisma.report.create({
      data: {
        userId: finalUserId || fallbackUserId,
        description: description || deskripsi || '',
        latitude: parseFloat(latitude) || 0,
        longitude: parseFloat(longitude) || 0,
        status: 'PENDING',
        photoUrl: finalPhotoUrl,
        email: email || null,
        pelapor: pelapor || null,
      },
    });

   // ✅ Kirim response dulu — laporan sudah tersimpan, jangan sampai user
// menunggu (atau dianggap gagal) hanya karena SMTP lambat/timeout.
res.status(201).json({
  success: true,
  message: 'Laporan berhasil dikirim!',
  data: {
    ...dataBaru,
    id: dataBaru.id.toString(),
    userId: dataBaru.userId?.toString() || null,
  },
});

// ✅ Kirim email di background, TIDAK di-await, tidak memblokir response.
// Kalau gagal, cukup dicatat di log — tidak memengaruhi status laporan.
if (email) {
  const emailContent = `
Halo ${pelapor || 'Pelapor'},

Terima kasih telah melaporkan masalah lingkungan di Kabupaten Toba.

📋 Detail Laporan:
- Nomor Laporan : ${dataBaru.id.toString()}
- Tanggal       : ${new Date(dataBaru.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
- Status        : PENDING (Menunggu Ditindaklanjuti)

Anda akan menerima notifikasi email ketika status laporan berubah.

Terima kasih atas kontribusi Anda untuk lingkungan yang lebih bersih! 🌱

---
Dinas Lingkungan Hidup
Kabupaten Toba
  `.trim();

  sendEmail(email, '✅ Laporan Sampah Diterima - DLH Toba', emailContent)
    .then(() => console.log(`📧 Email konfirmasi dikirim ke: ${email}`))
    .catch((emailError) =>
      console.error('⚠️ Gagal kirim email konfirmasi (non-blocking):', emailError)
    );
}
  } catch (error: any) {
    console.error('❌ ERROR CREATE LAPORAN:', error.message);

    let errorMessage = `Gagal mengirim laporan: ${error.message}`;
    if (error.code === 'P2001') errorMessage = 'User tidak ditemukan di database';
    else if (error.code === 'P2002') errorMessage = 'Duplikasi data - laporan serupa mungkin sudah ada';
    else if (error.code === 'P2025') errorMessage = 'Data referensi tidak ditemukan';

    return res.status(500).json({ success: false, message: errorMessage, code: error.code });
  }
};

// ============================================================
// GET LAPORAN BY USER
// ============================================================
export const getLaporanByUser = async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.params;
  const userIdString = userId as string;

  if (!userIdString || isNaN(Number(userIdString))) {
    return res.status(400).json({ success: false, message: 'ID user tidak valid' });
  }

  try {
    const data = await prisma.report.findMany({
      where: { userId: BigInt(userIdString) },
      orderBy: { createdAt: 'desc' },
    });

    // Konversi BigInt dan Decimal agar aman di JSON response
    const formattedData = data.map((item: any) => ({
      ...item,
      id: item.id.toString(),
      userId: item.userId?.toString() || null,
      latitude: item.latitude ? Number(item.latitude) : 0,
      longitude: item.longitude ? Number(item.longitude) : 0,
    }));

    return res.json({ success: true, data: formattedData });
  } catch (error: any) {
    console.error('Error getLaporanByUser:', error);
    return res.status(500).json({ success: false, message: 'Gagal ambil riwayat' });
  }
};

// ============================================================
// UPDATE STATUS LAPORAN — PATCH /:id
// ============================================================
export const updateStatus = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const idString = id as string;
  const { status } = req.body;

  const VALID_STATUSES = ['PENDING', 'DITINDAKLANJUTI', 'SELESAI', 'DITOLAK'];

  if (!idString || isNaN(Number(idString))) {
    return res.status(400).json({ success: false, message: 'ID tidak valid' });
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Status tidak valid. Harus salah satu dari: ${VALID_STATUSES.join(', ')}`,
    });
  }

  try {
    const laporanLama = await prisma.report.findUnique({
      where: { id: BigInt(idString) },
      include: { user: { select: { fullName: true, email: true, phoneNumber: true } } },
    });

    if (!laporanLama) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }

    const update = await prisma.report.update({
      where: { id: BigInt(idString) },
      data: { status },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('status_laporan_berubah', {
        reportId: update.id.toString(),
        newStatus: update.status,
      });
    }

    const emailTujuan: string | null = laporanLama.email || laporanLama.user?.email || null;
    const namaPelapor: string = laporanLama.pelapor || laporanLama.user?.fullName || 'Pelapor';

    if (emailTujuan) {
      try {
        let judulEmail = '';
        let isiPesan = '';

        if (status === 'DITINDAKLANJUTI') {
          judulEmail = '⏳ Laporan Anda Sedang Ditindaklanjuti - DLH Toba';
          isiPesan = `Halo ${namaPelapor},\n\nLaporan sampah Anda sedang DITINDAKLANJUTI oleh tim DLH.\n\n📋 Nomor Laporan: ${laporanLama.id.toString()}\nStatus: 🔄 DITINDAKLANJUTI\n\nTim kami sedang bekerja menyelesaikan masalah ini.\n\nTerima kasih! 🌱\n---\nDLH Kabupaten Toba`;
        } else if (status === 'SELESAI') {
          judulEmail = '✅ Laporan Anda Telah Selesai - DLH Toba';
          isiPesan = `Halo ${namaPelapor},\n\nLaporan sampah Anda telah SELESAI ditindaklanjuti.\n\n📋 Nomor Laporan: ${laporanLama.id.toString()}\nStatus: ✅ SELESAI\n\nMasalah lingkungan telah ditangani. Terima kasih! 🌱\n---\nDLH Kabupaten Toba`;
        } else if (status === 'DITOLAK') {
          judulEmail = '❌ Laporan Anda Ditolak - DLH Toba';
          isiPesan = `Halo ${namaPelapor},\n\nMohon maaf, laporan Anda tidak dapat kami proses.\n\n📋 Nomor Laporan: ${laporanLama.id.toString()}\nStatus: ❌ DITOLAK\n\nSilakan hubungi kami untuk informasi lebih lanjut.\n---\nDLH Kabupaten Toba`;
        }

        if (judulEmail && isiPesan) {
          await sendEmail(emailTujuan, judulEmail, isiPesan);
          console.log(`📧 Email notifikasi dikirim ke: ${emailTujuan} (Status: ${status})`);
        }
      } catch (emailError) {
        console.error('⚠️ Gagal kirim email notifikasi:', emailError);
      }
    }

    return res.json({
      success: true,
      message: 'Status berhasil diupdate',
      data: {
        ...update,
        id: update.id.toString(),
        userId: update.userId ? update.userId.toString() : null,
      },
    });
  } catch (error: any) {
    console.error('ERROR UPDATE STATUS:', error);
    return res.status(500).json({ success: false, message: 'Gagal update status' });
  }
};

// ============================================================
// DELETE LAPORAN
// ============================================================
export const deleteLaporan = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const idString = id as string;

  if (!idString || isNaN(Number(idString))) {
    return res.status(400).json({ success: false, message: 'ID tidak valid' });
  }

  try {
    await prisma.report.delete({ where: { id: BigInt(idString) } });
    return res.json({ success: true, message: 'Laporan berhasil dihapus' });
  } catch (error: any) {
    console.error('ERROR DELETE LAPORAN:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghapus laporan' });
  }
};

// ============================================================
// TOLAK LAPORAN — PUT /:id/tolak
// Dipanggil dari tombol "Tolak" di halaman admin
// Prioritas email: field laporan (warga non-login) → email user teregistrasi
// Otomatis kirim email notifikasi penolakan ke pelapor beserta alasannya
// ============================================================
export const tolakLaporan = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const idString = id as string;
  const { rejectionReason } = req.body;

  if (!idString || isNaN(Number(idString))) {
    return res.status(400).json({ success: false, message: 'ID tidak valid' });
  }

  if (!rejectionReason || !rejectionReason.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Alasan penolakan wajib diisi.',
    });
  }

  try {
    const laporan = await prisma.report.findUnique({
      where: { id: BigInt(idString) },
      include: {
        user: { select: { fullName: true, email: true, phoneNumber: true } },
      },
    });

    if (!laporan) {
      return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    }

    if (laporan.status === 'SELESAI') {
      return res.status(400).json({
        success: false,
        message: 'Laporan yang sudah selesai tidak dapat ditolak.',
      });
    }

    if (laporan.status === 'DITOLAK') {
      return res.status(400).json({
        success: false,
        message: 'Laporan ini sudah berstatus DITOLAK sebelumnya.',
      });
    }

    // Update status ke DITOLAK + simpan alasannya
    const updated = await prisma.report.update({
      where: { id: BigInt(idString) },
      data: { status: 'DITOLAK', rejectionReason: rejectionReason.trim() },
    });

    // Socket.io broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('status_laporan_berubah', {
        reportId: updated.id.toString(),
        newStatus: 'DITOLAK',
      });
    }

    // Kirim email penolakan
    // Prioritas: email di field laporan (warga non-login) → email user teregistrasi
    const emailTujuan: string | null = laporan.email || laporan.user?.email || null;
    const namaPelapor: string = laporan.pelapor || laporan.user?.fullName || 'Pelapor';

    if (emailTujuan) {
      try {
        const judulEmail = '❌ Laporan Anda Ditolak - DLH Toba';
        const isiPesan = `
Halo ${namaPelapor},

Kami mohon maaf, laporan sampah Anda tidak dapat kami proses saat ini.

📋 Detail Laporan:
- Nomor Laporan  : ${laporan.id.toString()}
- Deskripsi      : ${laporan.description || '-'}
- Tanggal Kirim  : ${new Date(laporan.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
- Status Terkini : DITOLAK

Alasan Penolakan:
${rejectionReason.trim()}

Jika Anda merasa laporan ini perlu ditinjau ulang, silakan hubungi kami
langsung atau kirimkan laporan baru dengan foto yang lebih jelas.

Terima kasih atas kepedulian Anda terhadap lingkungan.

---
Dinas Lingkungan Hidup
Kabupaten Toba
        `.trim();

        await sendEmail(emailTujuan, judulEmail, isiPesan);
        console.log(`📧 Email penolakan dikirim ke: ${emailTujuan}`);
      } catch (emailError) {
        // Email gagal tidak membatalkan proses tolak
        console.error('⚠️ Gagal kirim email penolakan:', emailError);
      }
    } else {
      console.warn(`⚠️ Laporan ${idString} ditolak — tidak ada email tujuan, notifikasi dilewati.`);
    }

    return res.json({
      success: true,
      message: 'Laporan berhasil ditolak' + (emailTujuan ? ' dan notifikasi telah dikirim.' : '.'),
      data: {
        ...updated,
        id: updated.id.toString(),
        userId: updated.userId ? updated.userId.toString() : null,
        rejectionReason: updated.rejectionReason,
      },
    });
  } catch (error: any) {
    console.error('ERROR TOLAK LAPORAN:', error);
    return res.status(500).json({ success: false, message: 'Gagal menolak laporan.' });
  }
};