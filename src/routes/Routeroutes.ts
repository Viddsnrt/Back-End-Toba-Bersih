    import { Router } from 'express';
    import * as ruteController from '../controllers/RouteControlle.js';
    import { authenticateToken, authorizeRole } from '../middleware/auth.js';
    

const router = Router();

// ── GET Rute (KABID dan ADMIN bisa akses untuk monitoring) ──
router.get('/', authenticateToken, (req, res, next) => {
  const user = (req as any).user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'KABID')) {
    return res.status(403).json({ success: false, error: 'Akses ditolak' });
  }
  next();
}, ruteController.getSemuaRute);

router.get('/:ruteId', authenticateToken, (req, res, next) => {
  const user = (req as any).user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'KABID')) {
    return res.status(403).json({ success: false, error: 'Akses ditolak' });
  }
  next();
}, ruteController.getDetailRute);

// ── Semua route manajemen hanya untuk ADMIN ──────────────────
router.use(authenticateToken);
router.use(authorizeRole(['ADMIN']));

// ── RouteTemplate CRUD ──────────────────────────────────────
router.post('/',                        ruteController.buatRute);          // POST   /api/rute
router.put('/:ruteId',                  ruteController.updateRute);        // PUT    /api/rute/:ruteId
router.delete('/:ruteId',              ruteController.hapusRute);          // DELETE /api/rute/:ruteId
router.patch('/:ruteId/toggle',         ruteController.toggleStatusRute);  // PATCH  /api/rute/:ruteId/toggle

// ── Waypoint CRUD ───────────────────────────────────────────
router.post('/:ruteId/waypoint',        ruteController.tambahWaypoint);    // POST   /api/rute/:ruteId/waypoint
router.put('/waypoint/:waypointId',     ruteController.updateWaypoint);    // PUT    /api/rute/waypoint/:id
router.delete('/waypoint/:waypointId',  ruteController.hapusWaypoint);     // DELETE /api/rute/waypoint/:id
router.put('/:ruteId/waypoint/reorder', ruteController.reorderWaypoints);  // PUT    /api/rute/:ruteId/waypoint/reorder

export default router;