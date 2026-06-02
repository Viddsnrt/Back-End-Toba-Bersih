import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';
import {
  getEdukasi,
  getEdukasiById,
  createEdukasi,
  updateEdukasi,
  deleteEdukasi,
} from '../controllers/edukasiController.js';

const router = Router();

// ✅ GET = publik (tanpa auth)
router.get('/', getEdukasi);
router.get('/:id', getEdukasiById);

// ✅ Write operations = ADMIN only
router.post('/', authenticateToken, authorizeRole(['ADMIN']), createEdukasi);
router.put('/:id', authenticateToken, authorizeRole(['ADMIN']), updateEdukasi);
router.delete('/:id', authenticateToken, authorizeRole(['ADMIN']), deleteEdukasi);

export default router;