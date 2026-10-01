import { supabase } from "../config/supabase.ts";
import type { Article, ArticleListResponse, ArticleQueryParams } from "../types/article.types.ts";
import type { ParsedArticle } from "./rss.service.ts";

function mapArticleFromDb(row: Record<string, unknown>): Article {
  return {
    id: row.id as string,
    auto_seo_id: row.auto_seo_id as string,
    title: row.title as string,
    slug: row.slug as string,
    excerpt: row.excerpt as string | null,
    content: row.content as string,
    featured_image: row.featured_image as string | null,
    category: row.category as string | null,
    tags: (row.tags as string[]) || [],
    author: row.author as string,
    published_at: row.published_at as string,
    seo_title: row.seo_title as string | null,
    seo_description: row.seo_description as string | null,
    status: row.status as 'published' | 'draft',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getArticles(params: ArticleQueryParams): Promise<ArticleListResponse> {
  const page = params.page || 1;
  const limit = Math.min(params.limit || 10, 50);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .eq('status', params.status || 'published')
    .order('published_at', { ascending: false });

  if (params.category) {
    query = query.eq('category', params.category);
  }

  if (params.search) {
    query = query.or(`title.ilike.%${params.search}%,excerpt.ilike.%${params.search}%,content.ilike.%${params.search}%`);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch articles: ${error.message}`);
  }

  const articles = (data || []).map(mapArticleFromDb);
  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    articles,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch article: ${error.message}`);
  }

  return mapArticleFromDb(data);
}

export async function getArticleByAutoSeoId(autoSeoId: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('auto_seo_id', autoSeoId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to fetch article by auto_seo_id: ${error.message}`);
  }

  return mapArticleFromDb(data);
}

export async function createArticle(article: ParsedArticle): Promise<Article> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('articles')
    .insert({
      auto_seo_id: article.auto_seo_id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.content,
      featured_image: article.featured_image,
      category: article.category,
      tags: article.tags,
      author: article.author,
      published_at: article.published_at,
      seo_title: article.seo_title,
      seo_description: article.seo_description,
      status: 'published',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create article: ${error.message}`);
  }

  return mapArticleFromDb(data);
}

export async function updateArticle(autoSeoId: string, article: Partial<ParsedArticle>): Promise<Article> {
  const { data, error } = await supabase
    .from('articles')
    .update({
      ...article,
      updated_at: new Date().toISOString(),
    })
    .eq('auto_seo_id', autoSeoId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update article: ${error.message}`);
  }

  return mapArticleFromDb(data);
}

export async function upsertArticle(article: ParsedArticle): Promise<Article> {
  const existing = await getArticleByAutoSeoId(article.auto_seo_id);
  
  if (existing) {
    return updateArticle(article.auto_seo_id, article);
  }
  
  return createArticle(article);
}

export async function syncArticles(articles: ParsedArticle[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const article of articles) {
    const existing = await getArticleByAutoSeoId(article.auto_seo_id);
    
    if (existing) {
      const needsUpdate = existing.title !== article.title ||
        existing.content !== article.content ||
        existing.published_at !== article.published_at;
      
      if (needsUpdate) {
        await updateArticle(article.auto_seo_id, article);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await createArticle(article);
      created++;
    }
  }

  return { created, updated, skipped };
}

export async function getCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('category')
    .eq('status', 'published')
    .not('category', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  const categories = [...new Set((data || []).map(row => row.category).filter(Boolean))];
  return categories.sort();
}