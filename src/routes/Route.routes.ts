    import { Router } from 'express';
    import * as ruteController from '../controllers/RouteControlle.js';
    import { authenticateToken, authorizeRole } from '../middleware/auth.js';

    const router = Router();

    // Semua route manajemen rute hanya untuk ADMIN
    router.use(authenticateToken);
    router.use(authorizeRole(['ADMIN']));

    // ── RouteTemplate CRUD ──────────────────────────────────────
    router.get('/',              ruteController.getSemuaRute);       // GET  /api/rute
    router.get('/:ruteId',       ruteController.getDetailRute);      // GET  /api/rute/:ruteId
    router.post('/',             ruteController.buatRute);           // POST /api/rute
    router.put('/:ruteId',       ruteController.updateRute);         // PUT  /api/rute/:ruteId
    router.delete('/:ruteId',    ruteController.hapusRute);          // DEL  /api/rute/:ruteId
    router.patch('/:ruteId/toggle', ruteController.toggleStatusRute);// PAT  /api/rute/:ruteId/toggle

    // ── Waypoint CRUD ───────────────────────────────────────────
    router.post('/:ruteId/waypoint',            ruteController.tambahWaypoint);   // POST single atau bulk
    router.put('/waypoint/:waypointId',         ruteController.updateWaypoint);   // PUT  /api/rute/waypoint/:id
    router.delete('/waypoint/:waypointId',      ruteController.hapusWaypoint);    // DEL  /api/rute/waypoint/:id
    router.put('/:ruteId/waypoint/reorder',     ruteController.reorderWaypoints); // PUT  reorder

    export default router;