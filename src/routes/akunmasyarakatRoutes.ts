import express from "express";
import {
  getUsers,
  createUser,
  bulkCreateUsers, // Import bulk function
  updateUser,
  deleteUser,
  exportUsers
} from "../controllers/akunmasyarakatController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Semua rute memerlukan authentication
router.get("/", authenticateToken, getUsers);
router.post("/", authenticateToken, createUser);
router.post("/bulk", authenticateToken, bulkCreateUsers); // Tambahkan bulk endpoint
router.put("/:id", authenticateToken, updateUser);
router.delete("/:id", authenticateToken, deleteUser);
router.get("/export", authenticateToken, exportUsers); // Tambahkan export endpoint

export default router;