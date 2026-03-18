import Stripe from "stripe";
import { createApiKey, getKeyByEmail } from "../lib/keys.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  // Replace price_xxx with your real Stripe Price IDs after creating products
  price_starter:  { credits: 500,   plan: "starter"  },
  price_builder:  { credits: 10000, plan: "builder"  },
  price_scale:    { credits: 50000, plan: "scale"    },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── POST /api/webhook — Stripe sends events here ──
  if (req.method === "POST") {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      // req.body must be raw buffer for signature verification
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const priceId = session.line_items?.data?.[0]?.price?.id ||
                      session.metadata?.price_id;

      const planConfig = PLANS[priceId];
      if (email && planConfig) {
        // Check if user already has a key (upgrade scenario)
        const existing = await getKeyByEmail(email);
        if (existing) {
          // Top up credits — in production update in KV
          console.log(`Upgrade: ${email} → ${planConfig.plan}`);
        } else {
          // New customer — create key and email it
          const apiKey = await createApiKey({
            email,
            plan: planConfig.plan,
            credits: planConfig.credits,
          });

          // Send key via email (Resend is free up to 3k/mo)
          await sendKeyEmail(email, apiKey, planConfig.plan);
        }
      }
    }

    return res.status(200).json({ received: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function sendKeyEmail(email, apiKey, plan) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Would email key to ${email}: ${apiKey}`);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ContextAPI <keys@contextapi.dev>",
      to: email,
      subject: "Your ContextAPI key is ready",
      html: `
        <div style="font-family:monospace;max-width:520px;margin:40px auto;color:#111">
          <h2 style="font-size:20px;margin-bottom:8px">Your API key</h2>
          <p style="color:#555;margin-bottom:24px">Welcome to ContextAPI. Here's your key — keep it safe.</p>
          <div style="background:#f5f5f0;border:1px solid #e0e0d8;border-radius:6px;padding:16px 20px;font-size:15px;letter-spacing:0.02em">
            ${apiKey}
          </div>
          <p style="margin-top:24px;color:#555">Plan: <strong>${plan}</strong><br/>
          Add it to your requests as:<br/>
          <code style="background:#f5f5f0;padding:2px 8px;border-radius:3px">Authorization: Bearer ${apiKey}</code></p>
          <p style="margin-top:24px"><a href="https://contextapi.dev/docs" style="color:#2a6">Read the docs →</a></p>
          <hr style="border:none;border-top:1px solid #e8e8e0;margin:32px 0"/>
          <p style="color:#aaa;font-size:12px">ContextAPI · Reply to this email if you have questions.</p>
        </div>
      `,
    }),
  });
}

// Export config to get raw body (needed for Stripe signature verification)
export const config = { api: { bodyParser: false } };
