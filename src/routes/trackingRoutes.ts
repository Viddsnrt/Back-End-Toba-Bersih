import { Router } from 'express';
import * as trackingController from '../controllers/TrackingController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Semua route memerlukan authentication
router.use(authenticateToken);

// Tracking routes
router.get('/truk-aktif', trackingController.getTrukAktif);
router.get('/riwayat/:truckId', trackingController.getRiwayatJalur);
router.get('/ringkasan/:truckId', trackingController.getRingkasanHasil);

// ✅ PERBAIKAN: Gunakan kurung kurawal untuk parameter opsional
// Dari: router.get('/jadwal-rute/:hari?', ...) 
// Menjadi:
router.get('/jadwal-rute{/:hari}', trackingController.getJadwalRute);

router.post('/update-lokasi', trackingController.updateLokasiTruk);
router.post('/mulai-kerja', trackingController.mulaiKerja);
router.post('/selesai-kerja', trackingController.selesaiKerja);

// Dropdown untuk admin
router.get('/truk-list', trackingController.getSemuaTruk);
router.get('/supir-list', trackingController.getSemuaSupir);

export default router;