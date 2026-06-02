// galleryController.ts — DIPERBAIKI
// Perbaikan:
//   1. Gunakan field name sesuai schema.prisma (snake_case: cover_url, album_id, image_url)
//   2. Model name yang benar: gallery_albums & gallery_photos
//   3. Relasi include memakai nama relasi yang benar dari schema

import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// Alias model agar tidak berulang
const albumModel  = () => (prisma as any).gallery_albums;
const photoModel  = () => (prisma as any).gallery_photos;

// ─────────────────────────────────────────────────────────────
// GET /api/galleries/albums
// Ambil semua album beserta foto-fotonya
// ─────────────────────────────────────────────────────────────
export const getAlbums = async (_req: Request, res: Response) => {
  try {
    const albums = await albumModel().findMany({
      orderBy: { created_at: 'desc' },
      include: {
        // Nama relasi di schema: gallery_albums -> gallery_photos
        gallery_photos: {
          orderBy: { created_at: 'asc' },
        },
      },
    });

    // Normalisasi ke camelCase supaya frontend tidak perlu berubah
    const normalized = albums.map(normalizeAlbum);
    res.json(normalized);
  } catch (error) {
    console.error('Error getAlbums:', error);
    res.status(500).json({ message: 'Gagal mengambil data album' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/galleries/albums/:id
// ─────────────────────────────────────────────────────────────
export const getAlbumById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const albumId = parseInt(req.params.id, 10);
    if (Number.isNaN(albumId)) return res.status(400).json({ message: 'ID tidak valid' });

    const album = await albumModel().findUnique({
      where: { id: albumId },
      include: {
        gallery_photos: { orderBy: { created_at: 'asc' } },
      },
    });

    if (!album) return res.status(404).json({ message: 'Album tidak ditemukan' });
    res.json(normalizeAlbum(album));
  } catch (error) {
    console.error('Error getAlbumById:', error);
    res.status(500).json({ message: 'Gagal mengambil data album' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/galleries/albums
// ─────────────────────────────────────────────────────────────
export const createAlbum = async (req: Request, res: Response) => {
  try {
    const { title, description, coverUrl } = req.body as {
      title?: string;
      description?: string;
      coverUrl?: string;
    };

    if (!title?.trim()) return res.status(400).json({ message: 'Judul album wajib diisi' });

    const album = await albumModel().create({
      data: {
        title:       title.trim(),
        description: description?.trim() || null,
        cover_url:   coverUrl || null,          // ← field sesuai schema
        updated_at:  new Date(),                // ← schema tidak punya @updatedAt, harus manual
      },
      include: { gallery_photos: true },
    });

    res.status(201).json(normalizeAlbum(album));
  } catch (error) {
    console.error('Error createAlbum:', error);
    res.status(500).json({ message: 'Gagal membuat album' });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/galleries/albums/:id
// ─────────────────────────────────────────────────────────────
export const updateAlbum = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const albumId = parseInt(req.params.id, 10);
    if (Number.isNaN(albumId)) return res.status(400).json({ message: 'ID tidak valid' });

    const { title, description, coverUrl } = req.body as {
      title?: string;
      description?: string;
      coverUrl?: string;
    };

    const album = await albumModel().update({
      where: { id: albumId },
      data: {
        ...(title       !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(coverUrl    !== undefined && { cover_url: coverUrl || null }),
        updated_at: new Date(),
      },
      include: { gallery_photos: true },
    });

    res.json(normalizeAlbum(album));
  } catch (error) {
    console.error('Error updateAlbum:', error);
    res.status(500).json({ message: 'Gagal memperbarui album' });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/galleries/albums/:id
// Cascade delete foto dilakukan oleh PostgreSQL (onDelete: Cascade di schema)
// ─────────────────────────────────────────────────────────────
export const deleteAlbum = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const albumId = parseInt(req.params.id, 10);
    if (Number.isNaN(albumId)) return res.status(400).json({ message: 'ID tidak valid' });

    // Cek album ada terlebih dahulu
    const existing = await albumModel().findUnique({ where: { id: albumId } });
    if (!existing) return res.status(404).json({ message: 'Album tidak ditemukan' });

    // Hapus foto dulu (jaga-jaga jika cascade belum aktif di DB)
    await photoModel().deleteMany({ where: { album_id: albumId } });
    await albumModel().delete({ where: { id: albumId } });

    res.json({ message: 'Album berhasil dihapus' });
  } catch (error) {
    console.error('Error deleteAlbum:', error);
    res.status(500).json({ message: 'Gagal menghapus album' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/galleries/albums/:albumId/photos
// ─────────────────────────────────────────────────────────────
export const addPhoto = async (req: Request<{ albumId: string }>, res: Response) => {
  try {
    const albumId = parseInt(req.params.albumId, 10);
    if (Number.isNaN(albumId)) return res.status(400).json({ message: 'ID Album tidak valid' });

    const { imageUrl, caption } = req.body as {
      imageUrl?: string;
      caption?: string;
    };

    if (!imageUrl) return res.status(400).json({ message: 'imageUrl wajib diisi' });

    // Cek album ada
    const album = await albumModel().findUnique({ where: { id: albumId } });
    if (!album) return res.status(404).json({ message: 'Album tidak ditemukan' });

    const photo = await photoModel().create({
      data: {
        album_id:  albumId,           // ← field sesuai schema
        image_url: imageUrl,          // ← field sesuai schema
        caption:   caption?.trim() || null,
      },
    });

    res.status(201).json(normalizePhoto(photo));
  } catch (error) {
    console.error('Error addPhoto:', error);
    res.status(500).json({ message: 'Gagal menambahkan foto' });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/galleries/photos/:photoId
// ─────────────────────────────────────────────────────────────
export const deletePhoto = async (req: Request<{ photoId: string }>, res: Response) => {
  try {
    const photoId = parseInt(req.params.photoId, 10);
    if (Number.isNaN(photoId)) return res.status(400).json({ message: 'ID Foto tidak valid' });

    const existing = await photoModel().findUnique({ where: { id: photoId } });
    if (!existing) return res.status(404).json({ message: 'Foto tidak ditemukan' });

    await photoModel().delete({ where: { id: photoId } });
    res.json({ message: 'Foto berhasil dihapus' });
  } catch (error) {
    console.error('Error deletePhoto:', error);
    res.status(500).json({ message: 'Gagal menghapus foto' });
  }
};

// ─────────────────────────────────────────────────────────────
// HELPER: Normalisasi snake_case DB → camelCase frontend
// ─────────────────────────────────────────────────────────────
function normalizePhoto(photo: any) {
  return {
    id:        photo.id,
    albumId:   photo.album_id,
    imageUrl:  photo.image_url,
    caption:   photo.caption,
    createdAt: photo.created_at,
  };
}

function normalizeAlbum(album: any) {
  return {
    id:          album.id,
    title:       album.title,
    description: album.description,
    coverUrl:    album.cover_url,           // ← snake → camel
    createdAt:   album.created_at,
    updatedAt:   album.updated_at,
    photos:      (album.gallery_photos ?? []).map(normalizePhoto),
  };
}