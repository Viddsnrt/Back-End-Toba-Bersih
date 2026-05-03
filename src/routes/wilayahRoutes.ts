import { Router } from 'express';
import { 
  getAllWilayah,
  getWilayahById,
  createWilayah,
  updateWilayah,
  deleteWilayah,
  toggleWilayahStatus,
  getAllPolygons
} from '../controllers/wilayahController.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = Router();

// Route publik (tanpa login) - untuk peta GIS
router.get('/polygons', getAllPolygons);
router.get('/public', getAllWilayah);
router.get('/public/:id', getWilayahById);

// Route protected (hanya admin)
router.use(authenticateToken);
router.use(authorizeRole(['ADMIN']));

router.get('/', getAllWilayah);
router.get('/:id', getWilayahById);
router.post('/', createWilayah);  
router.put('/:id', updateWilayah);
router.patch('/:id/toggle', toggleWilayahStatus);
router.delete('/:id', deleteWilayah);

export default router;