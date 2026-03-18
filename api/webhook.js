const Stripe = require("stripe");
const { createApiKey, getKeyByEmail } = require("../lib/keys");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;

    // Map Stripe price IDs to plans — update these after creating your Stripe products
    const PLANS = {
      price_builder: { credits: 3000,  plan: "builder" },
      price_scale:   { credits: 10000, plan: "scale"   },
    };

    const priceId = session.metadata?.price_id;
    const planConfig = PLANS[priceId] || { credits: 3000, plan: "builder" };

    if (email) {
      const existing = await getKeyByEmail(email);
      if (!existing) {
        const apiKey = await createApiKey({ email, plan: planConfig.plan, credits: planConfig.credits });

        if (process.env.RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "ContextAPI <onboarding@resend.dev>",
              to: email,
              subject: "Your ContextAPI key is ready",
              html: `
                <div style="font-family:monospace;max-width:520px;margin:40px auto;color:#111">
                  <h2>Welcome to ContextAPI</h2>
                  <p style="color:#555">Your ${planConfig.plan} plan is active. Here's your key:</p>
                  <div style="background:#f5f5f0;padding:16px;border-radius:6px;word-break:break-all;margin:16px 0">
                    ${apiKey}
                  </div>
                  <p style="color:#555">Credits: <strong>${planConfig.credits.toLocaleString()}</strong></p>
                  <p><a href="https://contextapi.dev" style="color:#2a6">View documentation →</a></p>
                </div>
              `,
            }),
          });
        }
      }
    }
  }

  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };