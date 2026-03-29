import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import axiosRetry from "axios-retry";
import FormData from "form-data";
import { z } from "zod";

// Configure axios retry
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Validation Schema
const WPConfigSchema = z.object({
  url: z.string().url(),
  username: z.string(),
  applicationPassword: z.string(),
});

const ArticleSchema = z.object({
  title: z.string(),
  content: z.string(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  slug: z.string().optional(),
  categories: z.array(z.number()).optional(),
  tags: z.array(z.number()).optional(),
  featured_image_url: z.string().url().optional().or(z.literal('')),
  status: z.enum(['publish', 'draft', 'future', 'pending', 'private']).default('publish'),
  date: z.string().optional(), // ISO string for scheduling
});

// Helper to get WP Auth Header
const getAuthHeader = (username: string, password: string) => {
  return {
    Authorization: `Basic ${Buffer.from(`${username.trim()}:${password.replace(/\s+/g, '')}`).toString('base64')}`,
  };
};

// Helper to normalize URL
const normalizeUrl = (url: string) => {
  return url.replace(/\/+$/, '');
};

// API Routes
app.post("/api/test-connection", async (req, res) => {
  try {
    const wpConfig = WPConfigSchema.parse(req.body);
    const baseUrl = normalizeUrl(wpConfig.url);
    
    const response = await axios.get(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: getAuthHeader(wpConfig.username, wpConfig.applicationPassword),
    });
    res.json({ success: true, user: response.data.name });
  } catch (error: any) {
    let message = error.response?.data?.message || error.message;
    
    // Specific help for common WP REST API errors
    if (error.response?.data?.code === 'rest_not_logged_in') {
      message = "WordPress rejected the credentials. Ensure you are using an 'Application Password' (not your login password) and that your username is correct.";
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      message = "Could not reach the site. Check the URL and ensure your site is online.";
    }

    res.status(400).json({ 
      success: false, 
      error: message 
    });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const wpConfig = WPConfigSchema.parse(req.body);
    const baseUrl = normalizeUrl(wpConfig.url);
    const response = await axios.get(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
      headers: getAuthHeader(wpConfig.username, wpConfig.applicationPassword),
    });
    res.json(response.data.map((c: any) => ({ id: c.id, name: c.name })));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/tags", async (req, res) => {
  try {
    const wpConfig = WPConfigSchema.parse(req.body);
    const baseUrl = normalizeUrl(wpConfig.url);
    const response = await axios.get(`${baseUrl}/wp-json/wp/v2/tags?per_page=100`, {
      headers: getAuthHeader(wpConfig.username, wpConfig.applicationPassword),
    });
    res.json(response.data.map((t: any) => ({ id: t.id, name: t.name })));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/publish", async (req, res) => {
  try {
    const { config, articles, internalLinks } = req.body;
    const wpConfig = WPConfigSchema.parse(config);
    const baseUrl = normalizeUrl(wpConfig.url);
    const results = [];

    // Internal Linker Logic (Optional)
    const processContent = (content: string, links: { keyword: string, url: string }[]) => {
      if (!links || links.length === 0) return content;
      let processed = content;
      links.forEach(link => {
        const regex = new RegExp(`\\b${link.keyword}\\b`, 'gi');
        processed = processed.replace(regex, `<a href="${link.url}">${link.keyword}</a>`);
      });
      return processed;
    };

    for (const article of articles) {
      try {
        const validatedArticle = ArticleSchema.parse(article);
        const finalContent = processContent(validatedArticle.content, internalLinks || []);
        
        // 1. Handle Featured Image if URL provided
        let featuredMediaId = null;
        if (validatedArticle.featured_image_url) {
          try {
            const imageRes = await axios.get(validatedArticle.featured_image_url, { responseType: 'arraybuffer' });
            const formData = new FormData();
            const filename = validatedArticle.featured_image_url.split('/').pop() || 'image.jpg';
            formData.append('file', Buffer.from(imageRes.data), filename);

            const mediaRes = await axios.post(`${baseUrl}/wp-json/wp/v2/media`, formData, {
              headers: {
                ...getAuthHeader(wpConfig.username, wpConfig.applicationPassword),
                ...formData.getHeaders(),
              },
            });
            featuredMediaId = mediaRes.data.id;
          } catch (imgErr) {
            console.error("Image upload failed:", imgErr);
          }
        }

        // 2. Create Post
        const postData: any = {
          title: validatedArticle.title,
          content: finalContent,
          status: validatedArticle.status,
          slug: validatedArticle.slug,
          featured_media: featuredMediaId,
          categories: validatedArticle.categories,
          tags: validatedArticle.tags,
        };

        if (validatedArticle.date && validatedArticle.date.trim() !== '') {
          postData.date = validatedArticle.date;
        }

        // Handle Categories/Tags (Simplified: assumes names or IDs)
        // Note: Real WP API expects IDs. For names, we'd need to fetch/create terms first.
        // For this tool, we'll try to match by name or just pass them if they are IDs.
        
        const response = await axios.post(`${baseUrl}/wp-json/wp/v2/posts`, postData, {
          headers: getAuthHeader(wpConfig.username, wpConfig.applicationPassword),
        });

        results.push({ title: validatedArticle.title, status: 'success', id: response.data.id, link: response.data.link });
      } catch (err: any) {
        results.push({ 
          title: article.title || 'Unknown', 
          status: 'failed', 
          error: err.response?.data?.message || err.message 
        });
      }
      
      // Simple rate limiting: 1 second between posts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({ results });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
