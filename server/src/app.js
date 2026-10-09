const express = require('express');
const { loadConfig } = require('./config');
const { corsAllowlist, securityHeaders, createRateLimiters } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { createTimetableRouter } = require('./routes/timetable');

/**
 * App factory: every call builds an isolated app with its own rate-limiter
 * stores, which keeps tests independent of one another.
 */
function createApp(overrides = {}) {
  const base = loadConfig();
  const config = {
    ...base,
    ...overrides,
    rateLimit: { ...base.rateLimit, ...(overrides.rateLimit || {}) },
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const limiters = createRateLimiters(config.rateLimit);

  app.use(securityHeaders());
  app.use(corsAllowlist(config.allowedOrigins));
  app.use(limiters.general);
  app.use(express.json({ limit: config.bodyLimit }));

  app.use('/api', createTimetableRouter({ solveLimiter: limiters.solve }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
