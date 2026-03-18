/**
 * Key management using Vercel KV (Redis-compatible, free tier)
 * Keys are stored as:  key:{apikey} → { credits, plan, email, created }
 */

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function validateApiKey(key) {
  if (!key || !key.startsWith("ctx_")) return null;
  try {
    const data = await redis.get(`key:${key}`);
    return data || null;
  } catch (err) {
    console.error("Redis error:", err);
    return null;
  }
}

export async function deductCredit(key) {
  try {
    const data = await redis.get(`key:${key}`);
    if (data) {
      data.credits = (data.credits || 0) - 1;
      await redis.set(`key:${key}`, data);
    }
  } catch (err) {
    console.error("Credit deduction error:", err);
  }
}

export async function createApiKey({ email, plan = "free", credits = 100 }) {
  const { nanoid } = await import("nanoid");
  const key = `ctx_${nanoid(32)}`;
  const keyData = {
    email,
    plan,
    credits,
    created: new Date().toISOString(),
  };
  await redis.set(`key:${key}`, keyData);
  await redis.set(`email:${email}`, key);
  return key;
}

export async function getKeyByEmail(email) {
  try {
    const key = await redis.get(`email:${email}`);
    if (!key) return null;
    const data = await redis.get(`key:${key}`);
    return data ? { key, ...data } : null;
  } catch {
    return null;
  }
}