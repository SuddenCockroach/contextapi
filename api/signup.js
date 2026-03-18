const { createApiKey, getKeyByEmail } = require("../lib/keys");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }

  const clean = email.toLowerCase().trim();
  const existing = await getKeyByEmail(clean);
  if (existing) {
    return res.status(200).json({ message: "You already have a key — check your original email." });
  }

  const apiKey = await createApiKey({ email: clean, plan: "free", credits: 100 });

  // Send email if Resend is configured
  if (process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ContextAPI <onboarding@resend.dev>",
        to: clean,
        subject: "Your ContextAPI key (100 free credits)",
        html: `
          <div style="font-family:monospace;max-width:520px;margin:40px auto;color:#111">
            <h2 style="font-size:20px;margin-bottom:8px">Your API key is ready</h2>
            <p style="color:#555;margin-bottom:24px">100 free credits to get started. No card needed.</p>
            <div style="background:#f5f5f0;border:1px solid #e0e0d8;border-radius:6px;padding:16px 20px;font-size:13px;word-break:break-all">
              ${apiKey}
            </div>
            <h3 style="margin-top:28px;font-size:14px">Quick start:</h3>
            <pre style="background:#f5f5f0;padding:16px;border-radius:6px;font-size:12px;overflow-x:auto">curl -X POST https://contextapi.dev/api/extract \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","mode":"summary"}'</pre>
            <p style="margin-top:20px"><a href="https://contextapi.dev" style="color:#2a6">Back to docs →</a></p>
          </div>
        `,
      }),
    });
  }

  return res.status(200).json({
    success: true,
    message: "Check your email for your API key.",
    // Show key directly in non-production so you can test without email
    ...(process.env.NODE_ENV !== "production" && { api_key: apiKey }),
  });
};