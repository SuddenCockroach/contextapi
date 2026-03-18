const Anthropic = require("@anthropic-ai/sdk");
const { validateApiKey, deductCredit } = require("../lib/keys");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ContextAPI/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);

  const html = await res.text();

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

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

  return {
    rawText: cleaned.slice(0, 12000),
    title: titleMatch?.[1]?.trim() || "",
    description: descMatch?.[1]?.trim() || "",
    ogImage: ogImageMatch?.[1]?.trim() || "",
  };
}

async function structureWithClaude(pageData, url, mode) {
  const modeInstructions = {
    rag: "Focus on extracting factual, self-contained chunks ideal for RAG retrieval.",
    summary: "Focus on producing a concise, information-dense summary with key points.",
    full: "Extract everything thoroughly — full markdown, all sections, entities, tables, code blocks.",
  };

  const prompt = `You are a web content extraction engine. Convert this web page into structured, LLM-ready output.

URL: ${url}
Title: ${pageData.title}
Mode: ${mode} — ${modeInstructions[mode] || modeInstructions.full}

RAW TEXT:
${pageData.rawText}

Return ONLY a JSON object with these exact fields (no explanation, no markdown fences):
{
  "markdown": "clean markdown of main content",
  "summary": "2-4 sentence summary",
  "key_points": ["point1", "point2", "point3"],
  "entities": { "people": [], "organizations": [], "topics": [], "locations": [] },
  "sections": [{ "heading": "title", "content": "text", "tokens_approx": 100 }],
  "tables": [],
  "code_blocks": [],
  "content_type": "article|product|documentation|landing_page|news|other",
  "language": "en",
  "token_count_approx": 0,
  "extraction_quality": "high|medium|low"
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(stripped);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing API key. Header: Authorization: Bearer YOUR_KEY" });
  }

  const apiKey = authHeader.slice(7);
  const keyData = await validateApiKey(apiKey);
  if (!keyData) return res.status(401).json({ error: "Invalid API key." });
  if (keyData.credits <= 0) return res.status(402).json({ error: "No credits. Upgrade at contextapi.dev/pricing" });

  const { url, mode = "full" } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required." });

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL." });
  }

  if (!["rag", "summary", "full"].includes(mode)) {
    return res.status(400).json({ error: "mode must be: rag | summary | full" });
  }

  const start = Date.now();
  try {
    const pageData = await fetchPage(url);
    const structured = await structureWithClaude(pageData, url, mode);
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
};