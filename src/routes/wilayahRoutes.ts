import { Router } from 'express';
import {
  getAllWilayah,
  getWilayahById,
  createWilayah,
  updateWilayah,
  deleteWilayah,
  toggleWilayahStatus,
  getAllPolygons,
  checkLocationInWilayah,
  validateWilayahData
} from '../controllers/wilayahController.js';

import {
  authenticateToken,
  authorizeRole
} from '../middleware/auth.js';

const router = Router();


// ============================
// PUBLIC ROUTES
// ============================

router.get('/polygons', getAllPolygons);
router.post('/check-location', checkLocationInWilayah);
router.get('/public', getAllWilayah);
router.get('/public/:id', getWilayahById);
// 🔥 VALIDASI DATA WILAYAH
router.get('/validate', validateWilayahData);


// ============================
// PROTECTED GET (ADMIN + KABID)
// ============================

router.get(
  '/',
  authenticateToken,
  (req, res, next) => {
    const user = (req as any).user;

    if (
      !user ||
      (user.role !== 'ADMIN' &&
        user.role !== 'KABID')
    ) {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak'
      });
    }

    next();
  },
  getAllWilayah
);

router.get(
  '/:id',
  authenticateToken,
  (req, res, next) => {
    const user = (req as any).user;

    if (
      !user ||
      (user.role !== 'ADMIN' &&
        user.role !== 'KABID')
    ) {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak'
      });
    }

    next();
  },
  getWilayahById
);


// ============================
// ADMIN ONLY
// ============================

router.use(authenticateToken);
router.use(authorizeRole(['ADMIN']));
router.post('/', createWilayah);
router.put('/:id', updateWilayah);
router.patch('/:id/toggle', toggleWilayahStatus);
router.delete('/:id', deleteWilayah);


export default router;