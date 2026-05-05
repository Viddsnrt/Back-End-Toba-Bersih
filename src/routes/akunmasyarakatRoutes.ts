import express from "express";
import { getUsers, createUser, updateUser, deleteUser }
from "../controllers/akunmasyarakatController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Semua rute memerlukan authentication
router.get("/", authenticateToken, getUsers);
router.post("/", authenticateToken, createUser);
router.put("/:id", authenticateToken, updateUser);
router.delete("/:id", authenticateToken, deleteUser);

export default router; 