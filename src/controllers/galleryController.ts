import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// GET semua album
export const getAlbums = async (req: Request, res: Response) => {
  try {
    const albums = await prisma.gallery_albums.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        gallery_photos: {
          orderBy: { created_at: 'asc' },
        },
      },
    });

    res.json(albums);
  } catch (error) {
    console.error('Error getAlbums:', error);
    res.status(500).json({ message: 'Gagal mengambil data album' });
  }
};

// GET album by ID
export const getAlbumById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const album = await prisma.gallery_albums.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        gallery_photos: {
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!album) {
      return res.status(404).json({ message: 'Album tidak ditemukan' });
    }

    res.json(album);
  } catch (error) {
    console.error('Error getAlbumById:', error);
    res.status(500).json({ message: 'Gagal mengambil data album' });
  }
};

// CREATE album
export const createAlbum = async (req: Request, res: Response) => {
  try {
    const { title, description, coverUrl } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Judul album wajib diisi' });
    }

    const album = await prisma.gallery_albums.create({
      data: {
        title,
        description: description || null,
        cover_url: coverUrl || null,
        updated_at: new Date(),
      },
      include: {
        gallery_photos: true,
      },
    });

    res.status(201).json(album);
  } catch (error) {
    console.error('Error createAlbum:', error);
    res.status(500).json({ message: 'Gagal membuat album' });
  }
};

// UPDATE album
export const updateAlbum = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { title, description, coverUrl } = req.body;

    const album = await prisma.gallery_albums.update({
      where: { id: parseInt(req.params.id) },
      data: {
        title,
        description: description || null,
        cover_url: coverUrl || null,
        updated_at: new Date(),
      },
      include: {
        gallery_photos: true,
      },
    });

    res.json(album);
  } catch (error) {
    console.error('Error updateAlbum:', error);
    res.status(500).json({ message: 'Gagal memperbarui album' });
  }
};

// DELETE album
export const deleteAlbum = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    await prisma.gallery_photos.deleteMany({
      where: { album_id: id },
    });

    await prisma.gallery_albums.delete({
      where: { id },
    });

    res.json({ message: 'Album berhasil dihapus' });
  } catch (error) {
    console.error('Error deleteAlbum:', error);
    res.status(500).json({ message: 'Gagal menghapus album' });
  }
};

// ADD photo
export const addPhoto = async (req: Request<{ albumId: string }>, res: Response) => {
  try {
    const albumId = parseInt(req.params.albumId);
    const { imageUrl, caption } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl wajib diisi' });
    }

    const album = await prisma.gallery_albums.findUnique({
      where: { id: albumId },
    });

    if (!album) {
      return res.status(404).json({ message: 'Album tidak ditemukan' });
    }

    const photo = await prisma.gallery_photos.create({
      data: {
        album_id: albumId,
        image_url: imageUrl,
        caption: caption || null,
      },
    });

    res.status(201).json(photo);
  } catch (error) {
    console.error('Error addPhoto:', error);
    res.status(500).json({ message: 'Gagal menambahkan foto' });
  }
};

// DELETE photo
export const deletePhoto = async (req: Request<{ photoId: string }>, res: Response) => {
  try {
    await prisma.gallery_photos.delete({
      where: { id: parseInt(req.params.photoId) },
    });

    res.json({ message: 'Foto berhasil dihapus' });
  } catch (error) {
    console.error('Error deletePhoto:', error);
    res.status(500).json({ message: 'Gagal menghapus foto' });
  }
};