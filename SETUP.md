# ContextAPI — Setup Guide
# Follow these steps exactly, in order.

## STEP 1 — Put the code on GitHub

1. Go to github.com → click "New repository"
2. Name it: contextapi
3. Set to Public
4. Do NOT add README or .gitignore (we'll push our own)
5. Click "Create repository"

Then open your terminal and run:

```bash
cd contextapi
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/contextapi.git
git push -u origin main
```

(Replace YOUR_USERNAME with your actual GitHub username)

---

## STEP 2 — Deploy to Vercel

1. Go to vercel.com (you're already logged in with GitHub)
2. Click "Add New Project"
3. Find your "contextapi" repo and click "Import"
4. Leave all settings as default
5. Click "Deploy"

It will fail (no env vars yet) — that's fine. Continue to Step 3.

---

## STEP 3 — Add Vercel KV (free database for API keys)

1. In your Vercel project dashboard → click "Storage" tab
2. Click "Create Database" → choose "KV"
3. Name it: contextapi-kv
4. Click "Create"
5. Vercel automatically adds the KV env vars to your project ✓

---

## STEP 4 — Add environment variables

In Vercel project → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| ANTHROPIC_API_KEY | sk-ant-api03-... (your Anthropic key) |
| STRIPE_SECRET_KEY | sk_live_... (add after Stripe setup) |
| STRIPE_WEBHOOK_SECRET | whsec_... (add after Stripe setup) |
| RESEND_API_KEY | re_... (add after Resend setup) |

After adding vars → go to Deployments → click "Redeploy" on the latest deployment.

---

## STEP 5 — Set up Resend (free email, 3,000/month)

This sends API keys to new users automatically.

1. Go to resend.com → Sign up free
2. Add your domain OR use their test domain for now
3. Go to "API Keys" → Create key
4. Copy the key → add to Vercel as RESEND_API_KEY

If you don't have a domain yet, skip this for now.
Keys will show in the Vercel logs instead (fine for first customers).

---

## STEP 6 — Set up Stripe (take real payments)

1. Go to stripe.com → Create account
2. Complete identity verification (required for Ghana — have your ID ready)
3. Go to Products → Create two products:

   Product 1: "Builder Plan"
   - Price: $19/month recurring
   - Copy the Price ID (price_xxx)

   Product 2: "Scale Plan"  
   - Price: $49/month recurring
   - Copy the Price ID (price_xxx)

4. Go to Payment Links → Create link for each product
   - Copy the payment link URLs

5. Open public/index.html → find the checkout() function at the bottom
   Replace the placeholder URLs:
   ```
   builder: 'https://buy.stripe.com/YOUR_REAL_BUILDER_LINK',
   scale:   'https://buy.stripe.com/YOUR_REAL_SCALE_LINK',
   ```

6. Set up Stripe Webhook:
   - Stripe Dashboard → Developers → Webhooks → Add endpoint
   - URL: https://YOUR_VERCEL_URL.vercel.app/api/webhook
   - Events: checkout.session.completed
   - Copy the webhook secret → add to Vercel as STRIPE_WEBHOOK_SECRET

7. Add your Stripe secret key to Vercel as STRIPE_SECRET_KEY

8. git add . && git commit -m "add stripe links" && git push
   Vercel auto-redeploys on push ✓

---

## STEP 7 — Test the full flow

```bash
# 1. Sign up for a free key (check Vercel logs for the key in dev)
curl -X POST https://YOUR_APP.vercel.app/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# 2. Use the key to extract a URL
curl -X POST https://YOUR_APP.vercel.app/api/extract \
  -H "Authorization: Bearer ctx_THE_KEY_YOU_GOT" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://en.wikipedia.org/wiki/Accra", "mode": "summary"}'
```

If you get back a JSON response with markdown and entities — it works! 🎉

---

## STEP 8 — Go live

1. Add a custom domain in Vercel (Settings → Domains)
   - Cheapest option: .dev domain on Namecheap ~$12/year
   - Or use the free vercel.app subdomain to start

2. Your API is now live. 

---

## Getting your first dollar — exact posts to make

### Post 1: r/LocalLLaMA (best AI dev community)

Title: "I built a simple API that returns LLM-ready content from any URL — free to try"

Body:
"Been building a RAG pipeline and kept writing the same HTML cleaning code. 
Built a tiny API that takes a URL and returns clean markdown + entities + 
token counts — structured for LLM input.

Free tier: 100 credits, no card.
Endpoint: POST /api/extract with {"url": "...", "mode": "rag|summary|full"}

Would love feedback from people building agents/RAG systems."

Link to your site.

---

### Post 2: Hacker News (Show HN — Tuesday 9am EST is best time)

Title: "Show HN: ContextAPI – turn any URL into LLM-ready structured content"

Body:
"I kept writing the same web content cleaning code for every RAG project. 
Built a simple API that handles it: send a URL, get back clean markdown, 
extracted entities, section chunks with token counts, and a summary.

Three modes: rag (for chunked retrieval), summary (quick context), full (everything).
100 free credits to try. Built on Claude Haiku for the structuring pass.

Happy to answer questions about the implementation."

---

### Post 3: Twitter/X

"just launched contextapi.dev

send any URL → get back LLM-ready content
clean markdown, entities, token counts, sections

free tier: 100 credits, no card
built for RAG pipelines and AI agents

[link]"

Tag: @LangChainAI @llama_index and a few AI builders you follow

---

## Revenue math

10 Builder users = $190/month
50 Builder users = $950/month  
100 Builder users = $1,900/month
200 Builder + 20 Scale = $4,780/month

Your cost at 200 users: ~$40/month (Anthropic API + Vercel Pro if needed)
Margin: ~99%
