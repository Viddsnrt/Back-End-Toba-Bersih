import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  addOperator,
  getSemuaSupir,
  tugaskanLaporan,
  updateOperator,
  deleteOperator,
  getSemuaTruk,
  addTruk,
  updateTruk,
  deleteTruk,
  getSemuaWilayah,  
  addWilayah,
  toggleWilayahStatus,
  deleteWilayah,
  getTrukAktif,
  getRiwayatJalur,
  updateLokasiTruk
} from '../controllers/adminController.js';

const router = Router();

// --- Rute Supir ---
router.post('/add-operator', authenticateToken, addOperator);
router.get('/supir-list', authenticateToken, getSemuaSupir);
router.put('/supir/:id', authenticateToken, updateOperator);
router.delete('/supir/:id', authenticateToken, deleteOperator);

// --- Rute Truk (Armada) ---
router.get('/truks', authenticateToken, getSemuaTruk);
router.post('/truks', authenticateToken, addTruk);
router.put('/truks/:id', authenticateToken, updateTruk);
router.delete('/truks/:id', authenticateToken, deleteTruk);

// --- Rute Wilayah (Location) ---
router.get('/wilayah', authenticateToken, getSemuaWilayah);
router.post('/wilayah', authenticateToken, addWilayah);
router.patch('/wilayah/:id/toggle', authenticateToken, toggleWilayahStatus);
router.delete('/wilayah/:id', authenticateToken, deleteWilayah);

// --- Rute Penugasan ---
router.patch('/laporan/:idLaporan/tugaskan', authenticateToken, tugaskanLaporan);

// --- Rute Tracking ---
router.get('/tracking/truk-aktif', authenticateToken, getTrukAktif);
router.get('/tracking/riwayat/:truckId', authenticateToken, getRiwayatJalur);
router.post('/tracking/update-lokasi', updateLokasiTruk); // tanpa auth, dipanggil dari Flutter

export default router;