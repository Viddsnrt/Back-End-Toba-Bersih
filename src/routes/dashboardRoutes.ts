import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = Router();

router.get(
  '/stats', 
  authenticateToken, 
  authorizeRole(['ADMIN']), 
  getDashboardStats
);

export default router;