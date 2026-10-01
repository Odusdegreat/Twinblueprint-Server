import { fetchAndParseArticles } from "../src/services/rss.service.ts";
import { syncArticles } from "../src/services/article.service.ts";

console.log("Testing full sync...");

try {
  const articles = await fetchAndParseArticles();
  console.log(`Fetched ${articles.length} articles`);
  
  const result = await syncArticles(articles);
  console.log("Sync result:", result);
} catch (error) {
  console.error("Error:", error);
}