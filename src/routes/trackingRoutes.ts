import { Router } from 'express';
import * as trackingController from '../controllers/TrackingController.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

// ── Khusus SUPIR — update posisi & status kerja milik diri sendiri ──
router.post('/update-lokasi',  authorizeRole(['OPERATOR']),                    trackingController.updateLokasiTruk);
router.post('/mulai-kerja',    authorizeRole(['OPERATOR']),                    trackingController.mulaiKerja);
router.post('/selesai-kerja',  authorizeRole(['OPERATOR']),                    trackingController.selesaiKerja);

// ── Monitoring — ADMIN & KABID ──
router.get('/truk-aktif',          authorizeRole(['ADMIN', 'KABID']),          trackingController.getTrukAktif);
router.get('/riwayat/:truckId',    authorizeRole(['ADMIN', 'KABID']),          trackingController.getRiwayatJalur);
router.get('/ringkasan/:truckId',  authorizeRole(['ADMIN', 'KABID']),          trackingController.getRingkasanHasil);
router.get('/riwayat-selesai',     authorizeRole(['ADMIN', 'KABID']),          trackingController.getRiwayatSelesai);

// ── Dropdown — ADMIN saja ──
router.get('/truk-list',           authorizeRole(['ADMIN']),                   trackingController.getSemuaTruk);
router.get('/supir-list',          authorizeRole(['ADMIN']),                   trackingController.getSemuaSupir);
router.get('/jadwal-rute',         authorizeRole(['ADMIN']),                   trackingController.getJadwalRute);

// ── Progress waypoint — ADMIN, KABID, dan OPERATOR (supir bisa lihat progress rutnya sendiri) ──
router.get('/progress/:truckId',   authorizeRole(['ADMIN', 'KABID', 'OPERATOR']), trackingController.getProgressWaypoint);

// ── Pelanggan lihat armada di wilayahnya ──
router.get('/wilayah-saya',        authorizeRole(['WARGA']),                   trackingController.getTrukByWilayah);

export default router;