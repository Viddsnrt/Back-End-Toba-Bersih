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
} from '../controllers/adminController.js';


const router = Router();

router.use(authenticateToken);
router.use(authorizeAdmin);

router.post('/add-operator', addOperator);
router.get('/supir-list', getSemuaSupir);
router.put('/supir/:id', updateOperator);
router.delete('/supir/:id', deleteOperator);

router.get('/truks', getSemuaTruk);
router.post('/truks', addTruk);
router.put('/truks/:id', updateTruk);
router.delete('/truks/:id', deleteTruk);

router.patch('/laporan/:idLaporan/tugaskan', tugaskanLaporan);
export default router;