import { Router } from 'express';
import { 
  createRutin, 
  createAduan, 
  getSemuaPenugasan, 
  updateTaskStatus,
  getNotifikasiUser // 🔥 1. WAJIB IMPORT FUNGSI BARU INI DI SINI
} from '../controllers/penugasanController.js';

const router = Router();

router.post('/rutin', createRutin);
router.post('/aduan', createAduan);
router.get('/', getSemuaPenugasan);

// Menambahkan endpoint PATCH untuk mengubah status dari HP Supir
router.patch('/:id/status', updateTaskStatus); 

// 🔥 2. TAMBAHKAN ENDPOINT GET NOTIFIKASI DI SINI
router.get('/notifikasi/user/:userId', getNotifikasiUser);

export default router;