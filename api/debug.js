module.exports = async function handler(req, res) {
  res.status(200).json({
    has_upstash_url: !!process.env.UPSTASH_REDIS_REST_URL,
    has_upstash_token: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    has_anthropic: !!process.env.ANTHROPIC_API_KEY,
    url_preview: process.env.UPSTASH_REDIS_REST_URL?.slice(0, 30) || "MISSING",
    node_env: process.env.NODE_ENV,
  });
};
