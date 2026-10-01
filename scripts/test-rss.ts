import { fetchAndParseArticles } from "../src/services/rss.service.ts";

console.log("Testing RSS fetch and parse...");

try {
  const articles = await fetchAndParseArticles();
  console.log(`Fetched ${articles.length} articles`);
  
  if (articles.length > 0) {
    const first = articles[0];
    console.log("\nFirst article:");
    console.log("Title:", first.title);
    console.log("Slug:", first.slug);
    console.log("Auto SEO ID:", first.auto_seo_id);
    console.log("Excerpt:", first.excerpt.substring(0, 100) + "...");
    console.log("Featured Image:", first.featured_image);
    console.log("Category:", first.category);
    console.log("Tags:", first.tags);
    console.log("Published At:", first.published_at);
    console.log("SEO Title:", first.seo_title);
    console.log("SEO Description:", first.seo_description);
    console.log("Content length:", first.content.length);
  }
} catch (error) {
  console.error("Error:", error);
}