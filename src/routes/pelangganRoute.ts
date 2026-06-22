import express from "express";
import {
  getPelanggan,
  getPelangganById,
  createPelanggan,
  bulkCreatePelanggan,
  updatePelanggan,
  deletePelanggan,
  exportPelanggan,
  exportPelangganByLocation, // ✅ ganti dari exportPelangganByDriver
} from "../controllers/datapelangganController.js";

import { authenticateToken, authorizeRole } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticateToken);

// ⚠️ URUTAN PENTING: route statis HARUS di atas route dinamis /:id
router.get("/export",                      authorizeRole(['ADMIN', 'KABID']), exportPelanggan);
router.get("/export/location/:locationId", authorizeRole(['ADMIN', 'KABID']), exportPelangganByLocation);
router.post("/bulk",                       authorizeRole(['ADMIN']),          bulkCreatePelanggan);

router.get("/",       authorizeRole(['ADMIN', 'KABID']), getPelanggan);
router.get("/:id",    authorizeRole(['ADMIN', 'KABID']), getPelangganById);
router.post("/",      authorizeRole(['ADMIN']),          createPelanggan);
router.put("/:id",    authorizeRole(['ADMIN']),          updatePelanggan);
router.delete("/:id", authorizeRole(['ADMIN']),          deletePelanggan);

export default router;