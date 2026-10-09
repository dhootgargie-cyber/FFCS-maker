const request = require('supertest');
const { createApp } = require('../src/app');

const ALLOWED = 'http://localhost:5173';
const makeApp = (o = {}) => createApp({ allowedOrigins: [ALLOWED], ...o });

describe('CORS allowlisting', () => {
  test('allows a listed origin and echoes it back', async () => {
    const res = await request(makeApp()).get('/api/health').set('Origin', ALLOWED);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  test('rejects an unlisted origin with 403', async () => {
    const res = await request(makeApp()).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CORS_REJECTED');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('allows requests without an Origin header', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('answers preflight for a listed origin', async () => {
    const res = await request(makeApp())
      .options('/api/timetables/solve')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });
});

describe('Helmet security headers', () => {
  let res;
  beforeAll(async () => {
    res = await request(makeApp()).get('/api/health');
  });

  test('sets X-Content-Type-Options: nosniff', () => {
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  test('sets a restrictive Content-Security-Policy', () => {
    expect(res.headers['content-security-policy']).toMatch(/default-src 'none'/);
  });
  test('sets Strict-Transport-Security', () => {
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
  test('hides X-Powered-By', () => {
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
  test('sets frame protection', () => {
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('Rate limiting', () => {
  const body = {
    courses: [{ code: 'CSE1001', credits: 3, options: [{ id: 'a', faculty: 'X', slots: 'A1+TA1' }] }],
  };

  test('general limiter returns 429 after the cap', async () => {
    const app = makeApp({ rateLimit: { generalMax: 3 } });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  test('solve limiter is stricter than the general limiter', async () => {
    const app = makeApp({ rateLimit: { generalMax: 100, solveMax: 2 } });
    expect((await request(app).post('/api/timetables/solve').send(body)).status).toBe(200);
    expect((await request(app).post('/api/timetables/solve').send(body)).status).toBe(200);
    expect((await request(app).post('/api/timetables/solve').send(body)).status).toBe(429);
    // Other endpoints are unaffected by the solve cap.
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  test('limiter state is isolated between app instances', async () => {
    const a = makeApp({ rateLimit: { generalMax: 1 } });
    const b = makeApp({ rateLimit: { generalMax: 1 } });
    expect((await request(a).get('/api/health')).status).toBe(200);
    expect((await request(a).get('/api/health')).status).toBe(429);
    expect((await request(b).get('/api/health')).status).toBe(200);
  });

  test('exposes standard RateLimit headers', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('Payload limits', () => {
  test('oversized body returns 413, not 500', async () => {
    const app = makeApp({ bodyLimit: '1kb' });
    const res = await request(app)
      .post('/api/timetables/solve')
      .send({ courses: [], pad: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('malformed JSON returns 400', async () => {
    const res = await request(makeApp())
      .post('/api/timetables/solve')
      .set('Content-Type', 'application/json')
      .send('{"courses": [');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_JSON');
  });

  test('unknown route returns 404 JSON', async () => {
    const res = await request(makeApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
