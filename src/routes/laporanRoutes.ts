import { Router } from 'express';
import { getLaporan, createLaporan, updateStatus, deleteLaporan, getLaporanByUser } from '../controllers/laporanController.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Ambil semua laporan (Untuk Admin)
router.get('/', getLaporan);
router.post('/create', upload.single('photo'), createLaporan);
router.get('/user/:userId', getLaporanByUser);
router.patch('/:id', updateStatus); 
router.delete('/:id', deleteLaporan);


export default router;