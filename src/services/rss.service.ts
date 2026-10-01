import { env } from "../config/env.config.ts";

export interface RSSItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  contentEncoded: string;
  category: string;
}

export interface ParsedArticle {
  auto_seo_id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image: string | null;
  category: string;
  tags: string[];
  author: string;
  published_at: string;
  seo_title: string;
  seo_description: string;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 200);
}

function extractFirstImage(html: string): string | null {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch ? (imgMatch[1] ?? null) : null;
}

function extractTags(category: string): string[] {
  if (!category) return [];
  return category
    .split(/[,;]/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

function parseRSSDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toISOString();
}

export async function fetchRSSFeed(): Promise<string> {
  const rssUrl = env.AUTO_SEO_RSS_URL;
  if (!rssUrl) {
    throw new Error('AUTO_SEO_RSS_URL environment variable is not set');
  }

  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'TwinBlueprint/1.0 (+https://twinblueprint.com)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function parseRSSFeed(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  
while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      
      const title = extractField(itemXml, 'title') as string;
      const link = extractField(itemXml, 'link') as string;
      const guid = extractField(itemXml, 'guid') as string;
      const pubDate = extractField(itemXml, 'pubDate') as string;
      const description = extractField(itemXml, 'description') as string;
      const contentEncoded = (extractField(itemXml, 'content:encoded') || extractField(itemXml, 'content')) as string;
      const category = extractField(itemXml, 'category') as string;
      
      if (title && guid) {
        items.push({
          title: cleanText(title),
          link: cleanText(link),
          guid: cleanText(guid),
          pubDate: cleanText(pubDate),
          description: cleanText(description),
          contentEncoded: cleanText(contentEncoded),
          category: cleanText(category),
        } as RSSItem);
      }
    }
  
  return items;
}

function extractField(xml: string, fieldName: string): string {
  const regex = new RegExp(`<${fieldName}[^>]*>([\\s\\S]*?)<\\/${fieldName}>`, 'i');
  const match = xml.match(regex);
  return (match ? (match[1] ?? '') : '') as string;
}

function cleanText(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

export function parseArticle(item: RSSItem): ParsedArticle {
  const autoSeoId = item.guid;
  const title = item.title;
  const baseSlug = generateSlug(title);
  const slug = `${baseSlug}-${extractArticleId(autoSeoId)}`;
  const excerpt = item.description;
  const content = item.contentEncoded;
  const featured_image = extractFirstImage(content);
  const category = item.category;
  const tags = extractTags(category);
  const author = 'Auto-SEO';
  const published_at = parseRSSDate(item.pubDate);
  const seo_title = title.length > 60 ? title.substring(0, 57) + '...' : title;
  const seo_description = excerpt.length > 160 ? excerpt.substring(0, 157) + '...' : excerpt;

  return {
    auto_seo_id: autoSeoId,
    title,
    slug,
    excerpt,
    content,
    featured_image,
    category,
    tags,
    author,
    published_at,
    seo_title,
    seo_description,
  };
}

function extractArticleId(guid: string): string {
  const match = guid.match(/\/article\/(\d+)/);
  return match ? (match[1] ?? '') : guid.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
}

export async function fetchAndParseArticles(): Promise<ParsedArticle[]> {
  const xml = await fetchRSSFeed();
  const items = parseRSSFeed(xml);
  return items.map(parseArticle);
}