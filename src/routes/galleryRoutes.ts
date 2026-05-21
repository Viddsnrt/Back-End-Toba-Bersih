import { Router } from 'express';
import {
  getAlbums,
  getAlbumById,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  addPhoto,
  deletePhoto,
} from '../controllers/galleryController.js';
 
const router = Router();
 
// ── Album routes ──────────────────────────────
router.get(   '/albums',                getAlbums);
router.get(   '/albums/:id',            getAlbumById);
router.post(  '/albums',                createAlbum);
router.put(   '/albums/:id',            updateAlbum);
router.delete('/albums/:id',            deleteAlbum);
 
// ── Photo routes ──────────────────────────────
router.post(  '/albums/:albumId/photos', addPhoto);
router.delete('/photos/:photoId',        deletePhoto);
 
export default router;