import type { Request, Response } from 'express';
import { prisma } from '../config/db.js';

// =====================
// GET PUBLIC POSTS
// =====================
export const getPosts = async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany({
      where: {
        isPublished: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: posts,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Gagal ambil posts',
    });
  }
};

// =====================
// GET BY ID
// =====================
export const getPostById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post tidak ditemukan',
      });
    }

    return res.json({
      success: true,
      data: post,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error ambil post',
    });
  }
};

// =====================
// CREATE POST
// =====================
export const createPost = async (req: Request, res: Response) => {
  try {
    const { title, content, imageUrl, category, slug } = req.body;

    if (!title || !content || !slug) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak lengkap',
      });
    }

    const authorId = (req as any).user?.id || 1;

    const post = await prisma.post.create({
      data: {
        title,
        content,
        imageUrl: imageUrl || null,
        category: category || 'BERITA',
        slug,
        authorId: BigInt(authorId),
        isPublished: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Gagal create post',
    });
  }
};

// =====================
// DELETE POST
// =====================
export const deletePost = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.post.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: 'Post dihapus',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Gagal delete post',
    });
  }
};