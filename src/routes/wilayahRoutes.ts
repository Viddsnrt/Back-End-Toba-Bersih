import { Router } from 'express';
import {
  getAllWilayah,
  getWilayahById,
  createWilayah,
  updateWilayah,
  deleteWilayah,
  toggleWilayahStatus,
  getAllPolygons,
  checkLocationInWilayah
} from '../controllers/wilayahController.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = Router();

// Route publik (tanpa login) - untuk peta GIS dan validasi lokasi
router.get('/polygons', getAllPolygons);
router.post('/check-location', checkLocationInWilayah);
router.get('/public', getAllWilayah);
router.get('/public/:id', getWilayahById);

// Route protected untuk monitoring/view - KABID dan ADMIN bisa akses untuk GET
router.get('/', authenticateToken, (req, res, next) => {
  const user = (req as any).user;
  // Allow ADMIN and KABID to GET wilayah data for monitoring
  if (!user || (user.role !== 'ADMIN' && user.role !== 'KABID')) {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak'
    });
  }
  next();
}, getAllWilayah);

router.get('/:id', authenticateToken, (req, res, next) => {
  const user = (req as any).user;
  // Allow ADMIN and KABID to GET wilayah data for monitoring
  if (!user || (user.role !== 'ADMIN' && user.role !== 'KABID')) {
    return res.status(403).json({
      success: false,
      error: 'Akses ditolak'
    });
  }
  next();
}, getWilayahById);

// Route protected (hanya admin) untuk modifikasi data
router.use(authenticateToken);
router.use(authorizeRole(['ADMIN']));

router.post('/', createWilayah);
router.put('/:id', updateWilayah);
router.patch('/:id/toggle', toggleWilayahStatus);
router.delete('/:id', deleteWilayah);

export default router;