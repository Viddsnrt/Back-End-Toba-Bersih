import type { Request, Response } from 'express';
import { prisma, supabase } from '../config/db.js';


// GET /api/laporan (Untuk ditampilkan di Web Admin)
export const getLaporan = async (req: Request, res: Response): Promise<any> => {
  try {
    const data = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, phoneNumber: true } }, 
        location: true
      }
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("ERROR GET LAPORAN:", error);
    return res.status(500).json({ success: false, message: "Gagal ambil data", detail: error.message });
  }
};

// POST /api/laporan/create (Untuk Warga Kirim Laporan dari Mobile)
// POST /api/laporan/create
export const createLaporan = async (req: Request, res: Response): Promise<any> => {
  const { userId, description, deskripsi, latitude, longitude, jenisSampah, photoUrl: bodyPhotoUrl } = req.body;
  const file = req.file;

  try {
    // 🔒 CEK USER VALID
 // 🔒 CEK USER (Sekarang Fleksibel/Opsional)
    let finalUserId: bigint | null = null;
    // Jika userId kosong/null/undefined/''/NaN, treat as masyarakat umum
    if (userId !== undefined && userId !== null && userId !== '' && !isNaN(Number(userId))) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
        if (userExists) {
          finalUserId = BigInt(userId);
        }
        // Jika user tidak ditemukan, treat as masyarakat umum (finalUserId tetap null)
      } catch {
        // Jika error konversi, treat as masyarakat umum
        finalUserId = null;
      }
    }

    // ✅ Laporan bisa dibuat dari lokasi apa saja (tanpa validasi geofence)

    // Upload foto ke Supabase (tidak berubah)
    let finalPhotoUrl = bodyPhotoUrl || null;
    if (file) {
      const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
      const { data, error } = await supabase.storage
        .from('Foto-sampah')
        .upload(fileName, file.buffer, { contentType: file.mimetype });
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage
        .from('Foto-sampah')
        .getPublicUrl(fileName);
      finalPhotoUrl = publicUrlData.publicUrl;
    }

    let mappedJenisSampah = 'CAMPURAN';
    if (jenisSampah === 'Tumpukan Sampah') mappedJenisSampah = 'CAMPURAN';
    if (jenisSampah === 'Fasilitas Rusak') mappedJenisSampah = 'ANORGANIK';
    if (jenisSampah === 'Sampah Danau') mappedJenisSampah = 'CAMPURAN';
    if (jenisSampah === 'Lainnya') mappedJenisSampah = 'CAMPURAN';

    // Cari user exist sebagai fallback jika userId tidak valid
    let fallbackUserId = null;
    if (!finalUserId) {
      const fallbackUser = await prisma.user.findFirst({
        where: {
          role: { in: ['WARGA', 'ADMIN', 'OPERATOR'] },
          isActive: true
        }
      });
      if (fallbackUser) {
        fallbackUserId = fallbackUser.id;
      }
    }

    const dataBaru = await prisma.report.create({
      data: {
        userId: finalUserId || fallbackUserId,
        description: description || deskripsi || '',
        latitude: parseFloat(latitude) || 0,
        longitude: parseFloat(longitude) || 0,
        jenisSampah: mappedJenisSampah,
        status: 'PENDING',
        photoUrl: finalPhotoUrl,
      },
    });

  return res.status(201).json({
  success: true,
  message: 'Laporan berhasil dikirim!',
  data: {
    ...dataBaru,
    id: dataBaru.id.toString(),
    // Gunakan Optional Chaining (?.) agar tidak error jika null
    userId: dataBaru.userId?.toString() || null, 
    locationId: dataBaru.locationId?.toString() || null,
  }
});
  } catch (error: any) {
    console.error("ERROR CREATE LAPORAN:", error);
    return res.status(500).json({ success: false, message: `Gagal mengirim laporan: ${error.message}` });
  }
};

export const getLaporanByUser = async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.params;
  try {
    const data = await prisma.report.findMany({
      where: { userId: BigInt(userId) },
      orderBy: { createdAt: 'desc' }
    });

    const formattedData = data.map((item: any) => ({
      ...item,
      id: item.id.toString(),
      userId: item.userId.toString()
    }));

    return res.json({ success: true, data: formattedData });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Gagal ambil riwayat" });
  }
};

// PATCH /api/laporan/:id
export const updateStatus = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }

  try {
    const update = await prisma.report.update({
      where: { id: BigInt(id) },
      data: { status }
    });

    // =========================================================
    // 🔥 FITUR REAL-TIME: Kirim event WebSocket ke HP Flutter!
    // =========================================================
    const io = req.app.get('io'); // Mengambil instance Socket.io dari index.ts
    
    if (io) {
      io.emit('status_laporan_berubah', {
        reportId: update.id.toString(), // Kirim ID laporan yang baru diubah
        newStatus: update.status        // Kirim status barunya (DIPROSES/SELESAI)
      });
      console.log(`[Socket.io] Status Update Terkirim: Laporan ${update.id} menjadi ${update.status}`);
    }

    return res.json({ 
      success: true, 
      message: "Status berhasil diupdate", 
      data: { ...update, id: update.id.toString() } 
    });
  } catch (error: any) {
    console.error("ERROR UPDATE STATUS:", error);
    return res.status(500).json({ success: false, message: "Gagal update status" });
  }
};

// DELETE /api/laporan/:id
export const deleteLaporan = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ success: false, message: "ID tidak valid" });
  }

  try {
    await prisma.report.delete({ where: { id: BigInt(id) } });
    return res.json({ success: true, message: "Laporan berhasil dihapus" });
  } catch (error: any) {
    console.error("ERROR DELETE LAPORAN:", error);
    return res.status(500).json({ success: false, message: "Gagal menghapus laporan" });
  }
};