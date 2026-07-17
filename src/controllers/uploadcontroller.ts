import type { Request, Response } from 'express';
import { supabase } from '../config/db.js';   // ← pakai yang sudah dikonfigurasi benar

const BUCKET_NAME = 'report-images';

export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File tidak ditemukan' });
    }

    const file = req.file;
    const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ message: 'Gagal upload ke storage', error: error.message });
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return res.json({ imageUrl: urlData.publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ message: 'Gagal upload file' });
  }
};