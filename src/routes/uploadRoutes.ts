import { Router } from 'express';
import multer from 'multer';
import { uploadImage } from '../controllers/uploadcontroller.js';

const router = Router();

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, 
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar atau video yang diizinkan'));
    }
  },
});

// FIX: tambah error handler untuk multer limit exceeded
router.post('/', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Ukuran file melebihi batas maksimal 5MB' });
      }
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, uploadImage);

export default router;