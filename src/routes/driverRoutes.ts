import { Router } from 'express';
// 🔥 Pastikan getDriverTasks ikut di-import dari controller
import { getAvailableTasks, toggleDriverStatus, getDriverTasks } from '../controllers/driverController.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/tasks/available', getAvailableTasks);
router.put('/status', authorizeRole(['DRIVER']), toggleDriverStatus);
router.get('/:driverId/tasks', authorizeRole(['DRIVER']), getDriverTasks);
export default router;