import { Router } from 'express';
import { 
  createRutin, 
  createAduan, 
  getSemuaPenugasan, 
  updateTaskStatus // 🔥 Menambahkan fungsi baru
} from '../controllers/penugasanController.js';

const router = Router();

router.post('/rutin', createRutin);
router.post('/aduan', createAduan);
router.get('/', getSemuaPenugasan);

// 🔥 Menambahkan endpoint PATCH untuk mengubah status dari HP Supir
router.patch('/:id/status', updateTaskStatus); 

export default router;