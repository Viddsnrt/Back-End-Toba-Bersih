    import { Router } from 'express';
    import * as ruteController from '../controllers/RouteControlle.js';
    import { authenticateToken, authorizeRole } from '../middleware/auth.js';

    const router = Router();

    // ── GET Rute (untuk monitoring) - KABID dan ADMIN bisa akses ──
    router.get('/', authenticateToken, (req, res, next) => {
      const user = (req as any).user;
      // Allow ADMIN and KABID to GET rute data for monitoring
      if (!user || (user.role !== 'ADMIN' && user.role !== 'KABID')) {
        return res.status(403).json({
          success: false,
          error: 'Akses ditolak'
        });
      }
      next();
    }, ruteController.getSemuaRute);

    router.get('/:ruteId', authenticateToken, (req, res, next) => {
      const user = (req as any).user;
      // Allow ADMIN and KABID to GET rute data for monitoring
      if (!user || (user.role !== 'ADMIN' && user.role !== 'KABID')) {
        return res.status(403).json({
          success: false,
          error: 'Akses ditolak'
        });
      }
      next();
    }, ruteController.getDetailRute);

    // Semua route manajemen rute hanya untuk ADMIN
    router.use(authenticateToken);
    router.use(authorizeRole(['ADMIN']));

    // ── RouteTemplate CRUD ──────────────────────────────────────
    router.post('/',             ruteController.buatRute);           // POST /api/rute
    router.put('/:ruteId',       ruteController.updateRute);         // PUT  /api/rute/:ruteId
    router.delete('/:ruteId',    ruteController.hapusRute);          // DEL  /api/rute/:ruteId
    // router.patch('/:ruteId/toggle', ruteController.toggleStatusRute);// PAT  /api/rute/:ruteId/toggle

    // ── Waypoint CRUD ───────────────────────────────────────────
    router.post('/:ruteId/waypoint',            ruteController.tambahWaypoint);   // POST single atau bulk
    router.put('/waypoint/:waypointId',         ruteController.updateWaypoint);   // PUT  /api/rute/waypoint/:id
    router.delete('/waypoint/:waypointId',      ruteController.hapusWaypoint);    // DEL  /api/rute/waypoint/:id
    router.put('/:ruteId/waypoint/reorder',     ruteController.reorderWaypoints); // PUT  reorder

    export default router;