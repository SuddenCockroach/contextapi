import Anthropic from "@anthropic-ai/sdk";
import { validateApiKey, deductCredit } from "../lib/keys.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Fetch + clean raw page content ──────────────────────────────────────────
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ContextAPI/1.0; +https://contextapi.dev)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const html = await res.text();

  // Strip scripts, styles, SVGs, comments — keep text content
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, "\n\n")
    .trim();

  // Extract title and meta description from raw HTML
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  const ogImageMatch = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );

  return {
    rawText: cleaned.slice(0, 12000), // cap to avoid huge LLM bills
    title: titleMatch?.[1]?.trim() || "",
    description: descMatch?.[1]?.trim() || "",
    ogImage: ogImageMatch?.[1]?.trim() || "",
  };
}

// ── Ask Claude to structure the content ─────────────────────────────────────
async function structureWithClaude(pageData, url, mode) {
  const modeInstructions = {
    rag: "Focus on extracting factual, self-contained chunks ideal for RAG retrieval. Each section should be independently meaningful.",
    summary: "Focus on producing a concise, information-dense summary. Extract key points and entities.",
    full: "Extract everything thoroughly — full markdown, all sections, all entities, tables, and code blocks.",
  };

  const prompt = `You are a web content extraction engine. Convert this web page content into structured, LLM-ready output.

URL: ${url}
Page Title: ${pageData.title}
Meta Description: ${pageData.description}
Mode: ${mode} — ${modeInstructions[mode] || modeInstructions.full}

RAW PAGE TEXT:
${pageData.rawText}

Return a JSON object with exactly these fields:
{
  "markdown": "full clean markdown version of the main content",
  "summary": "2-4 sentence summary of what this page is about",
  "key_points": ["array", "of", "5-8", "key", "points"],
  "entities": {
    "people": [],
    "organizations": [],
    "topics": [],
    "locations": []
  },
  "sections": [
    { "heading": "Section title", "content": "Section text", "tokens_approx": 120 }
  ],
  "tables": [],
  "code_blocks": [],
  "links_mentioned": [],
  "content_type": "article|product|documentation|landing_page|news|other",
  "language": "en",
  "token_count_approx": 0,
  "extraction_quality": "high|medium|low"
}

Return ONLY valid JSON. No explanation, no markdown fences.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();

  // Safe parse
  try {
    return JSON.parse(text);
  } catch {
    // If Claude wrapped in fences despite instructions, strip them
    const stripped = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(stripped);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // ── Auth ──
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Missing API key. Add header: Authorization: Bearer YOUR_KEY",
    });
  }
  const apiKey = authHeader.slice(7);
  const keyData = await validateApiKey(apiKey);
  if (!keyData) {
    return res.status(401).json({ error: "Invalid API key." });
  }
  if (keyData.credits <= 0) {
    return res.status(402).json({
      error: "No credits remaining. Upgrade at contextapi.dev/pricing",
    });
  }

  // ── Input ──
  const { url, mode = "full" } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "url is required in request body." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return res.status(400).json({ error: "Invalid URL. Must start with http:// or https://" });
  }

  if (!["rag", "summary", "full"].includes(mode)) {
    return res.status(400).json({ error: "mode must be: rag | summary | full" });
  }

  const start = Date.now();

  try {
    // Fetch and structure
    const pageData = await fetchPage(url);
    const structured = await structureWithClaude(pageData, url, mode);

    // Deduct 1 credit
    await deductCredit(apiKey);

    return res.status(200).json({
      success: true,
      url,
      mode,
      title: pageData.title,
      og_image: pageData.ogImage || null,
      ...structured,
      meta: {
        processing_ms: Date.now() - start,
        credits_used: 1,
        credits_remaining: keyData.credits - 1,
      },
    });
  } catch (err) {
    console.error("Extract error:", err.message);

    if (err.message.includes("Failed to fetch")) {
      return res.status(422).json({ error: `Could not fetch URL: ${err.message}` });
    }
    return res.status(500).json({ error: "Extraction failed.", detail: err.message });
  }
}
