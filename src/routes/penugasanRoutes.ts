import { Router } from 'express';
import {createAduan, getSemuaPenugasan } from '../controllers/penugasanController.js';

const router = Router();

router.post('/aduan', createAduan);
router.get('/', getSemuaPenugasan);

export default router;