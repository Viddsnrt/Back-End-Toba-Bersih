import { Router } from 'express';
import {
  getPosts,
  getPostById,
  createPost,
  deletePost,
} from '../controllers/postController.js';

const router = Router();

router.get('/', getPosts);
router.get('/:id', getPostById);
router.post('/', createPost);
router.delete('/:id', deletePost);

export default router;