import { Router } from 'express';
import { 
  login, 
  register, 
  verifyToken, 
  logout, 
  updateProfile  // ✅ Ditambahkan dari versi mobile
} from '../controllers/authController.js';

const router = Router();

// Endpoint untuk login supir/admin
router.post('/login', login);
router.post('/register', register);

// ✅ Endpoint untuk verifikasi token (untuk frontend check session)
router.post('/verify', verifyToken);

// ✅ Endpoint untuk logout
router.post('/logout', logout);

// ✅ Endpoint update profil (dari versi mobile)
router.put('/update-profile', updateProfile);

export default router;