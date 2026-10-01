import { env } from "../config/env.config.ts";
import { fetchAndParseArticles } from "./rss.service.ts";
import { syncArticles } from "./article.service.ts";

export async function runArticleSync(): Promise<{ created: number; updated: number; skipped: number }> {
  console.log('[Article Sync] Starting article sync...');
  
  try {
    const articles = await fetchAndParseArticles();
    console.log(`[Article Sync] Fetched ${articles.length} articles from RSS feed`);
    
    const result = await syncArticles(articles);
    console.log(`[Article Sync] Sync completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
    
    return result;
  } catch (error) {
    console.error('[Article Sync] Error during sync:', error);
    throw error;
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startArticleSyncScheduler(): () => void {
  const intervalMinutes = Number(process.env.ARTICLE_SYNC_INTERVAL_MINUTES) || 60;
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`[Article Sync] Starting scheduler with ${intervalMinutes} minute interval`);
  
  runArticleSync().catch(err => console.error('[Article Sync] Initial sync failed:', err));
  
  syncInterval = setInterval(() => {
    runArticleSync().catch(err => console.error('[Article Sync] Scheduled sync failed:', err));
  }, intervalMs);
  
  return () => {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
      console.log('[Article Sync] Scheduler stopped');
    }
  };
}