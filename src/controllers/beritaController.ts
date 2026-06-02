import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db.js';

// ── Helper: serialize BigInt ────────────────────────────────────────
const serializeData = (data: any): any => {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
};

// ── Auth check ──────────────────────────────────────────────────────
const checkAuth = (req: Request, res: Response): boolean => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    return false;
  }

  const token = authHeader.substring(7);
  if (!token || token.length < 10) {
    res.status(401).json({ success: false, message: 'Token tidak valid' });
    return false;
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'rahasia-default'
    ) as { id: string | number; email: string; role: string; fullName?: string };

    (req as any).user = decoded;
    return true;
  } catch {
    res.status(403).json({
      success: false,
      message: 'Token tidak valid atau sudah kadaluarsa',
    });
    return false;
  }
};

// ── Slug helpers ────────────────────────────────────────────────────
const slugify = (title: string): string =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);

const generateUniqueSlug = async (
  title: string,
  excludeId?: number
): Promise<string> => {
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let count = 1;

  while (true) {
    const existing = await prisma.post.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (!existing) break;
    count += 1;
    slug = `${baseSlug}-${count}`;
  }

  return slug;
};

// ── GET ALL POSTS ───────────────────────────────────────────────────
export const getPosts = async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, fullName: true },
        },
      },
    });

    return res.json({
      success: true,
      data: serializeData(posts), // ← fix BigInt
    });
  } catch (error) {
    console.error('getPosts error:', error);
    return res.status(500).json({ success: false, message: 'Gagal ambil posts' });
  }
};

// ── GET BY ID ───────────────────────────────────────────────────────
export const getPostById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID tidak valid' });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { fullName: true } },
      },
    });

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post tidak ditemukan' });
    }

    return res.json({ success: true, data: serializeData(post) }); // ← fix BigInt
  } catch (error) {
    console.error('getPostById error:', error);
    return res.status(500).json({ success: false, message: 'Error ambil post' });
  }
};

// ── CREATE POST ─────────────────────────────────────────────────────
export const createPost = async (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  try {
    const { title, content, imageUrl, category } = req.body;

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Judul dan konten wajib diisi' });
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID tidak ditemukan dalam token' });
    }

    const user = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan. Silakan login ulang.' });
    }

    const slug = await generateUniqueSlug(title.trim());

    const post = await prisma.post.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        slug,
        imageUrl: imageUrl || null,
        category: category || 'BERITA',
        authorId: BigInt(userId),
        isPublished: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: serializeData(post), // ← fix BigInt
    });
  } catch (error: any) {
    console.error('createPost error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal create post',
    });
  }
};

// ── UPDATE POST ─────────────────────────────────────────────────────
export const updatePost = async (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID tidak valid' });
    }

    const { title, content, imageUrl, category } = req.body;

    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Judul dan konten wajib diisi' });
    }

    const existingPost = await prisma.post.findUnique({ where: { id } });
    if (!existingPost) {
      return res.status(404).json({ success: false, message: 'Post tidak ditemukan' });
    }

    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID tidak ditemukan dalam token' });
    }

    const user = await prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan. Silakan login ulang.' });
    }

    // Regenerate slug hanya jika judul berubah
    const slug =
      title.trim() !== existingPost.title
        ? await generateUniqueSlug(title.trim(), id)
        : existingPost.slug;

    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        title: title.trim(),
        content: content.trim(),
        slug,
        imageUrl: imageUrl || null,
        category: category || 'BERITA',
        authorId: BigInt(userId),
      },
    });

    return res.json({
      success: true,
      data: serializeData(updatedPost), // ← fix BigInt
    });
  } catch (error: any) {
    console.error('updatePost error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal update post',
    });
  }
};

// ── DELETE POST ─────────────────────────────────────────────────────
export const deletePost = async (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID tidak valid' });
    }

    // Cek dulu apakah post ada
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Post tidak ditemukan' });
    }

    await prisma.post.delete({ where: { id } });

    return res.json({ success: true, message: 'Post berhasil dihapus' });
  } catch (error: any) {
    console.error('deletePost error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Gagal delete post',
    });
  }
};