import { Router } from 'express';
import { authenticateToken, authorizeAdmin } from '../middleware/auth.js';
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
  // getTrukAktif,
  // getRiwayatJalur,
  // updateLokasiTruk,
  createKabid,
  getAllKabid,
  updateKabid,
  deleteKabid,
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

// --- Rute Penugasan ---
router.patch('/laporan/:idLaporan/tugaskan', authenticateToken, tugaskanLaporan);

// --- Rute Tracking ---
// router.get('/tracking/truk-aktif', authenticateToken, getTrukAktif);
// router.get('/tracking/riwayat/:truckId', authenticateToken, getRiwayatJalur);
// router.post('/tracking/update-lokasi', updateLokasiTruk); // tanpa auth, dipanggil dari Flutter

// --- Manajemen Kepala Bidang (KABID) – hanya ADMIN ---
router.get('/kabid', authenticateToken, authorizeAdmin, getAllKabid);
router.post('/kabid', authenticateToken, authorizeAdmin, createKabid);
router.put('/kabid/:id', authenticateToken, authorizeAdmin, updateKabid);
router.delete('/kabid/:id', authenticateToken, authorizeAdmin, deleteKabid);

export default router;