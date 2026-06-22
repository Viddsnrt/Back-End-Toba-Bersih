import type { Request, Response } from 'express';
import { prisma, supabase } from '../config/db.js';
import { sendEmail } from '../utils/sendEmail.js'; 

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

    // console.log(`✅ Berhasil fetch ${data.length} laporan`);

    return res.json({
      success: true,
      total: formattedData.length,
      data: formattedData,
    });
  } catch (error: any) {
    console.error(" ERROR GET LAPORAN:", error.message);
    console.error("Error Code:", error.code);
    console.error("Full Error:", error);

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
    // 🆕 TAMBAHAN: Validasi email jika masyarakat tidak login
    if (!userId || userId === '' || userId === null) {
      if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          message: '⚠️ Email tidak valid! Silakan masukkan email yang benar untuk pemberitahuan status laporan.',
        });
      }
    }

    // CEK USER (Fleksibel/Opsional)
    let finalUserId: bigint | null = null;
    // Jika userId kosong/null/undefined/''/NaN, treat as masyarakat umum
    if (userId !== undefined && userId !== null && userId !== '' && !isNaN(Number(userId))) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
        if (userExists) finalUserId = BigInt(userId);
      } catch {
        // Jika error konversi, treat as masyarakat umum
        finalUserId = null;
      }
    }
    // ============================================================
    //  UPLOAD FOTO KE SUPABASE
    // ============================================================
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

    // ============================================================
    //  VALIDASI ML (Quality Check + Prediksi) 
    // ============================================================
    if (file && finalPhotoUrl) {
      try {
        const mlResult = await validateWasteImage(file.buffer, file.originalname);
        console.log(`[ML] Prediksi: ${mlResult.prediction.label} (${(mlResult.prediction.confidence * 100).toFixed(1)}%)`);

        if (mlResult.prediction.class === 0) {
          // Hapus foto yang sudah terupload di Supabase
          if (uploadedFileName) {
            await supabase.storage.from('Foto-sampah').remove([uploadedFileName]);
          }
          return res.status(422).json({
            success: false,
            message: `Foto sampah dinilai "Tidak Layak Diangkut" oleh sistem (confidence: ${(mlResult.prediction.confidence * 100).toFixed(0)}%). Silakan foto ulang dengan sudut yang lebih jelas.`,
            ml_result: mlResult
          });
        }

      } catch (err) {
        // Quality check gagal (blur, gelap, coverage terlalu kecil, dll)
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
        
        // Error teknis ML server (mati/timeout) — laporan tetap bisa masuk (non-blocking)
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

    // Kirim email konfirmasi ke masyarakat
    if (email) {
      try {
        const emailContent = `
Halo ${pelapor || 'Pelapor'},

Terima kasih telah melaporkan masalah lingkungan di Kabupaten Toba.

📋 Detail Laporan:
- Nomor Laporan: ${dataBaru.id.toString()}
- Tanggal: ${new Date(dataBaru.createdAt).toLocaleDateString('id-ID')}
- Status: PENDING (Menunggu Ditindaklanjuti)

Anda akan menerima notifikasi email ketika status laporan berubah.

Terima kasih atas kontribusi Anda untuk lingkungan yang lebih bersih! 🌱

---
Dinas Lingkungan Hidup
Kabupaten Toba
        `.trim();

        await sendEmail(email, '✅ Laporan Sampah Diterima - DLH Toba', emailContent);
        console.log(`📧 Email konfirmasi dikirim ke: ${email}`);
      } catch (emailError) {
        console.error("⚠️ Gagal kirim email konfirmasi:", emailError);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Laporan berhasil dikirim!',
      data: {
        ...dataBaru,
        id: dataBaru.id.toString(),
        userId: dataBaru.userId?.toString() || null,
        // ⚠️ CATATAN: Aktifkan baris di bawah jika kolom locationId sudah ada di schema Prisma
        // locationId: (dataBaru as any).locationId?.toString() || null,
      },
    });
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
      orderBy: { createdAt: 'desc' }
    });

    const formattedData = data.map((item: any) => ({
      ...item,
      id: item.id.toString(),
      userId: item.userId?.toString() || null
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

    // =========================================================
    // 🔥 FITUR REAL-TIME: Kirim event WebSocket ke HP Flutter!
    // =========================================================
    const io = req.app.get('io');
    if (io) {
      io.emit('status_laporan_berubah', {
        reportId: update.id.toString(),
        newStatus: update.status
      });
      console.log(`[Socket.io] Status Update Terkirim: Laporan ${update.id} menjadi ${update.status}`);
    }

    let emailTujuan: string | null = null;
    let namaPelapor: string | null = null;

    if (laporanLama.email) {
      emailTujuan = laporanLama.email;
      namaPelapor = laporanLama.pelapor || 'Pelapor';
    } else if (laporanLama.user?.email) {
      emailTujuan = laporanLama.user.email;
      namaPelapor = laporanLama.user.fullName || 'User';
    }

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
      message: "Status berhasil diupdate", 
      data: { ...update, id: update.id.toString() } 
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