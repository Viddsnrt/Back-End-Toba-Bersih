import { Router } from 'express';
import multer from 'multer';
import { 
  createRutin,
  createAduan, 
  getSemuaPenugasan, 
  updateTaskStatus,
  getNotifikasiUser,
  deletePenugasan,
  updatePenugasan
} from '../controllers/penugasanController.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  }
});

// --- Endpoint Penugasan ---
router.post('/aduan', createAduan);
router.get('/', getSemuaPenugasan);
router.put('/:id', updatePenugasan); 

router.patch('/:id/status', upload.array('photos', 5), updateTaskStatus);

router.get('/notifikasi/user/:userId', getNotifikasiUser);

// ✅ Hapus penugasan (reset truck + laporan otomatis)
router.delete('/:id', deletePenugasan);

export default router;