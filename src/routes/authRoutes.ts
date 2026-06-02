import { Router } from 'express';
import { login, register, verifyToken, logout } from '../controllers/authController.js'; // Pastikan controller ini juga sudah dibuat

const router = Router();

// Endpoint untuk login supir/admin
router.post('/login', login);
router.post('/register', register);

// ✅ Endpoint untuk verifikasi token (untuk frontend check session)
router.post('/verify', verifyToken);

// ✅ Endpoint untuk logout
router.post('/logout', logout);

export default router;