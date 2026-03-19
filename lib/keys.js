const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Simple random key generator — no nanoid needed
function generateKey() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "ctx_";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function validateApiKey(key) {
  if (!key || !key.startsWith("ctx_")) return null;
  try {
    const data = await redis.get(`key:${key}`);
    return data || null;
  } catch (err) {
    console.error("Redis error:", err);
    return null;
  }
}

async function deductCredit(key) {
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

async function createApiKey({ email, plan = "free", credits = 100 }) {
  const key = generateKey();
  const keyData = { email, plan, credits, created: new Date().toISOString() };
  await redis.set(`key:${key}`, keyData);
  await redis.set(`email:${email}`, key);
  return key;
}

async function getKeyByEmail(email) {
  try {
    const key = await redis.get(`email:${email}`);
    if (!key) return null;
    const data = await redis.get(`key:${key}`);
    return data ? { key, ...data } : null;
  } catch {
    return null;
  }
}

module.exports = { validateApiKey, deductCredit, createApiKey, getKeyByEmail };