import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

// FIX: Jangan pass 'ws' sebagai transport ke Supabase realtime
// Supabase di Node.js sudah otomatis menggunakan WebSocket bawaan sejak versi terbaru
// Kalau kamu butuh ws secara eksplisit, gunakan globalThis

// Polyfill WebSocket untuk Node.js (jika Node < 21 atau environment tidak punya native WebSocket)
// Uncomment baris di bawah HANYA jika kamu masih Node 18 dan muncul error "WebSocket not defined"
// import { WebSocket } from 'ws';
// if (!globalThis.WebSocket) {
//   (globalThis as any).WebSocket = WebSocket;
// }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
  // FIX: Hapus opsi realtime.transport karena type-nya tidak kompatibel dengan ws package
  // Supabase JS v2 terbaru sudah handle WebSocket sendiri di Node.js
);

const BUCKET_NAME = 'galeri';

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