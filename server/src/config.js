function parseList(value, fallback) {
  if (!value) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 5000,
    allowedOrigins: parseList(env.ALLOWED_ORIGINS, ['http://localhost:5173']),
    bodyLimit: env.BODY_LIMIT || '100kb',
    rateLimit: {
      windowMs: Number(env.RATE_WINDOW_MS) || 15 * 60 * 1000,
      generalMax: Number(env.RATE_GENERAL_MAX) || 100,
      solveMax: Number(env.RATE_SOLVE_MAX) || 20,
    },
  };
}

module.exports = { loadConfig };
