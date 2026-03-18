import { createApiKey, getKeyByEmail } from "../lib/keys.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }

  // Check if already signed up
  const existing = await getKeyByEmail(email.toLowerCase().trim());
  if (existing) {
    return res.status(200).json({
      message: "You already have a key — check your email.",
      // Don't return the key again for security; prompt them to check email
    });
  }

  const apiKey = await createApiKey({
    email: email.toLowerCase().trim(),
    plan: "free",
    credits: 100,
  });

  // Send welcome email with key
  if (process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ContextAPI <keys@contextapi.dev>",
        to: email,
        subject: "Your free ContextAPI key (100 credits)",
        html: `
          <div style="font-family:monospace;max-width:520px;margin:40px auto;color:#111">
            <h2 style="font-size:20px;margin-bottom:8px">Welcome to ContextAPI</h2>
            <p style="color:#555;margin-bottom:24px">Here's your free API key with 100 credits to get started.</p>
            <div style="background:#f5f5f0;border:1px solid #e0e0d8;border-radius:6px;padding:16px 20px;font-size:14px;word-break:break-all">
              ${apiKey}
            </div>
            <h3 style="margin-top:32px;font-size:15px">Quick start:</h3>
            <pre style="background:#f5f5f0;padding:16px;border-radius:6px;font-size:13px;overflow-x:auto">curl -X POST https://contextapi.dev/api/extract \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com","mode":"full"}'</pre>
            <p style="margin-top:24px">
              <a href="https://contextapi.dev/docs" style="color:#2a6;font-weight:bold">Read the full docs →</a>
            </p>
            <p style="margin-top:24px;color:#888;font-size:12px">
              Need more credits? <a href="https://contextapi.dev/pricing" style="color:#2a6">Upgrade your plan</a>
            </p>
          </div>
        `,
      }),
    });
  }

  return res.status(200).json({
    success: true,
    message: "Key sent to your email. Check your inbox.",
    // In dev (no Resend key), return key directly so you can test
    ...(process.env.NODE_ENV !== "production" && { api_key: apiKey }),
  });
}
