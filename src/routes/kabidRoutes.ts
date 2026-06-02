// routes/kabidRoutes.ts
import { Router } from 'express';
import { authenticateToken, authorizeKabid } from '../middleware/auth.js';
import {
  getDashboardKinerja,
  getMonitoringArmada,
  getStatistikOperasional,
  getPetaAduan,
  exportRekapLaporan,
  getFilterOptions,
} from '../controllers/kabidController.js';

const router = Router();

// Semua route KABID wajib login dan ber-role KABID atau ADMIN
router.use(authenticateToken);
router.use(authorizeKabid);

// ── Dashboard Kinerja ─────────────────────────────────────────────────────────
router.get('/dashboard', getDashboardKinerja);

// ── Monitoring Armada ─────────────────────────────────────────────────────────
router.get('/monitoring-armada', getMonitoringArmada);

// ── Statistik & Analitik ──────────────────────────────────────────────────────
router.get('/statistik', getStatistikOperasional);

// ── Filter Options (dropdown data) ───────────────────────────────────────────
router.get('/filter-options', getFilterOptions);

// ── Peta Persebaran Aduan ─────────────────────────────────────────────────────
router.get('/peta-aduan', getPetaAduan);

// ── Export Rekapitulasi (POST karena mengirim body) ───────────────────────────
router.post('/export-rekap', exportRekapLaporan);

export default router;