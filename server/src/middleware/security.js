const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/** Layer 1: CORS with a strict origin allowlist. */
function corsAllowlist(allowedOrigins) {
  return cors({
    origin(origin, callback) {
      // Non-browser clients (curl, server-to-server) send no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      const err = new Error('Origin not allowed by CORS');
      err.status = 403;
      err.code = 'CORS_REJECTED';
      return callback(err);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  });
}

/** Layer 2: security headers (CSP, HSTS, noSniff, frameguard, ...). */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
}

function limiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message, code: 'RATE_LIMITED' },
  });
}

/**
 * Layer 3: tiered rate limiting.
 * Each call creates fresh limiter instances with their own in-memory store,
 * so separate app instances (e.g. in tests) never share counters.
 */
function createRateLimiters({ windowMs, generalMax, solveMax }) {
  return {
    general: limiter({ windowMs, max: generalMax, message: 'Too many requests, slow down.' }),
    solve: limiter({ windowMs, max: solveMax, message: 'Too many solve requests, try again later.' }),
  };
}

module.exports = { corsAllowlist, securityHeaders, createRateLimiters };
