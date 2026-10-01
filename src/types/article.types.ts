export interface Article {
  id: string;
  auto_seo_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  category: string | null;
  tags: string[];
  author: string;
  published_at: string;
  seo_title: string | null;
  seo_description: string | null;
  status: 'published' | 'draft';
  created_at: string;
  updated_at: string;
}

export interface ArticleListResponse {
  articles: Article[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ArticleQueryParams {
  page?: number;
  limit?: number;
  category?: string;
  status?: 'published' | 'draft';
  search?: string;
}