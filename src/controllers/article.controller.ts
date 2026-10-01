import type { Request, Response } from "express";
import { getArticles, getArticleBySlug, getCategories } from "../services/article.service.ts";
import { runArticleSync } from "../services/article-sync.service.ts";
import type { ArticleQueryParams } from "../types/article.types.ts";
import { articleQuerySchema, articleParamsSchema } from "../validations/article.validation.ts";
import { authenticate } from "../middleware/auth.ts";

export async function listArticles(req: Request, res: Response): Promise<void> {
  const parsed = articleQuerySchema.safeParse(req.query);
  
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid query parameters',
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const params: ArticleQueryParams = parsed.data;
  
  try {
    const result = await getArticles(params);
    
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch articles',
    });
  }
}

export async function getArticle(req: Request, res: Response): Promise<void> {
  const parsed = articleParamsSchema.safeParse(req.params);
  
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid slug parameter',
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { slug } = parsed.data;
  
  try {
    const article = await getArticleBySlug(slug);
    
    if (!article) {
      res.status(404).json({
        success: false,
        message: 'Article not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { article },
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch article',
    });
  }
}

export async function listCategories(req: Request, res: Response): Promise<void> {
  try {
    const categories = await getCategories();
    
    res.status(200).json({
      success: true,
      data: { categories },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
    });
  }
}

export async function manualSync(req: Request, res: Response): Promise<void> {
  try {
    const result = await runArticleSync();
    
    res.status(200).json({
      success: true,
      message: 'Article sync completed',
      data: result,
    });
  } catch (error) {
    console.error('Error during manual sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync articles',
    });
  }
}