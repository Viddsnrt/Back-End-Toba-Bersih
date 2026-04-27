import { Router } from 'express';
import { getLaporan, createLaporan, updateStatus, deleteLaporan, getLaporanByUser } from '../controllers/laporanController.js';
import multer from 'multer';

const router = Router();

// Konfigurasi multer untuk menyimpan file sementara di RAM sebelum dikirim ke Supabase
const upload = multer({ storage: multer.memoryStorage() });

// Ambil semua laporan (Untuk Admin)
router.get('/', getLaporan);

// 🔥 PERBAIKAN: Ubah rute menjadi '/create' agar dikenali oleh aplikasi Flutter
// Middleware upload.single('photo') tetap kita pasang bersiap-siap saat warga upload foto dari kamera HP
router.post('/create', upload.single('photo'), createLaporan);

router.get('/user/:userId', getLaporanByUser);

// 🔥 PERBAIKAN: Hapus '/status' agar URL-nya cocok dengan panggilan dari ManageLaporan.tsx
router.patch('/:id', updateStatus); 

// Hapus laporan
router.delete('/:id', deleteLaporan);


export default router;