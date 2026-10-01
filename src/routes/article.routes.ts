import { Router } from "express";
import { listArticles, getArticle, listCategories, manualSync } from "../controllers/article.controller.ts";
import { authenticate } from "../middleware/auth.ts";

const router = Router();

router.get('/', listArticles);
router.get('/categories', listCategories);
router.get('/:slug', getArticle);

// Admin-only manual sync endpoint
router.post('/sync', authenticate, manualSync);

export default router;