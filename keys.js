/**
 * Key management using Vercel KV (Redis-compatible, free tier)
 * Keys are stored as:  key:{apikey} → { credits, plan, email, created }
 */

import { kv } from "@vercel/kv";

export async function validateApiKey(key) {
  if (!key || !key.startsWith("ctx_")) return null;
  try {
    const data = await kv.get(`key:${key}`);
    return data || null;
  } catch (err) {
    console.error("KV error:", err);
    return null;
  }
}

export async function deductCredit(key) {
  try {
    await kv.hincrby(`key:${key}`, "credits", -1);
  } catch (err) {
    console.error("Credit deduction error:", err);
  }
}

export async function createApiKey({ email, plan = "free", credits = 100 }) {
  const { nanoid } = await import("nanoid");
  const key = `ctx_${nanoid(32)}`;
  await kv.set(`key:${key}`, {
    email,
    plan,
    credits,
    created: new Date().toISOString(),
  });
  // Also index by email so we can look up keys
  await kv.set(`email:${email}`, key);
  return key;
}

export async function getKeyByEmail(email) {
  try {
    const key = await kv.get(`email:${email}`);
    if (!key) return null;
    const data = await kv.get(`key:${key}`);
    return { key, ...data };
  } catch {
    return null;
  }
}
