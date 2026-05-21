import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// =============================================
// HELPER — snake_case DB → camelCase response
// Dipanggil di SEMUA endpoint
// =============================================
function normalizeEdukasi(item: any) {
  return {
    id:        item.id,
    judul:     item.judul,
    deskripsi: item.deskripsi,
    mediaUrl:  item.media_url,    // ✅ snake → camel
    mediaType: item.media_type,   // ✅ snake → camel
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

// =============================================
// GET ALL  ← perbaikan utama: sekarang dinormalisasi
// =============================================
export const getEdukasi = async (_req: Request, res: Response) => {
  try {
    const list = await prisma.edukasi.findMany({
      orderBy: { created_at: 'desc' },
    });
    // ✅ sebelumnya mengembalikan raw data, sekarang di-normalize
    return res.json(list.map(normalizeEdukasi));
  } catch (error) {
    console.error('Error getEdukasi:', error);
    return res.status(500).json({ message: 'Gagal mengambil data edukasi' });
  }
};

// =============================================
// GET BY ID
// =============================================
export const getEdukasiById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID tidak valid' });

    const edukasi = await prisma.edukasi.findUnique({ where: { id } });
    if (!edukasi) return res.status(404).json({ message: 'Edukasi tidak ditemukan' });

    return res.json(normalizeEdukasi(edukasi));
  } catch (error) {
    console.error('Error getEdukasiById:', error);
    return res.status(500).json({ message: 'Gagal mengambil data edukasi' });
  }
};

// =============================================
// CREATE
// =============================================
export const createEdukasi = async (req: Request, res: Response) => {
  try {
    const { judul, deskripsi, mediaUrl, mediaType } = req.body as {
      judul?: string;
      deskripsi?: string | null;
      mediaUrl?: string;
      mediaType?: string;
    };

    if (!judul?.trim())  return res.status(400).json({ message: 'Judul wajib diisi' });
    if (!mediaUrl)       return res.status(400).json({ message: 'mediaUrl wajib diisi' });
    if (!mediaType)      return res.status(400).json({ message: 'mediaType wajib diisi' });

    const normalizedType = String(mediaType).toUpperCase();
    if (normalizedType !== 'IMAGE' && normalizedType !== 'VIDEO') {
      return res.status(400).json({ message: 'mediaType harus IMAGE atau VIDEO' });
    }

    const created = await prisma.edukasi.create({
      data: {
        judul:      judul.trim(),
        deskripsi:  deskripsi ?? null,
        media_url:  mediaUrl,
        media_type: normalizedType as 'IMAGE' | 'VIDEO',
        updated_at: new Date(),
      },
    });

    return res.status(201).json(normalizeEdukasi(created));
  } catch (error) {
    console.error('Error createEdukasi:', error);
    return res.status(500).json({ message: 'Gagal membuat edukasi', error: (error as any)?.message });
  }
};

// =============================================
// UPDATE
// =============================================
export const updateEdukasi = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID tidak valid' });

    const { judul, deskripsi, mediaUrl, mediaType } = req.body as {
      judul?: string;
      deskripsi?: string | null;
      mediaUrl?: string;
      mediaType?: string;
    };

    if (!judul?.trim())  return res.status(400).json({ message: 'Judul wajib diisi' });
    if (!mediaUrl)       return res.status(400).json({ message: 'mediaUrl wajib diisi' });
    if (!mediaType)      return res.status(400).json({ message: 'mediaType wajib diisi' });

    const normalizedType = String(mediaType).toUpperCase();
    if (normalizedType !== 'IMAGE' && normalizedType !== 'VIDEO') {
      return res.status(400).json({ message: 'mediaType harus IMAGE atau VIDEO' });
    }

    const updated = await prisma.edukasi.update({
      where: { id },
      data: {
        judul:      judul.trim(),
        deskripsi:  deskripsi ?? null,
        media_url:  mediaUrl,
        media_type: normalizedType as 'IMAGE' | 'VIDEO',
        updated_at: new Date(),
      },
    });

    return res.json(normalizeEdukasi(updated));
  } catch (error) {
    console.error('Error updateEdukasi:', error);
    return res.status(500).json({ message: 'Gagal memperbarui edukasi', error: (error as any)?.message });
  }
};

// =============================================
// DELETE
// =============================================
export const deleteEdukasi = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID tidak valid' });

    await prisma.edukasi.delete({ where: { id } });
    return res.json({ message: 'Edukasi berhasil dihapus' });
  } catch (error) {
    console.error('Error deleteEdukasi:', error);
    return res.status(500).json({ message: 'Gagal menghapus edukasi' });
  }
};