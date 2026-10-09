const request = require('supertest');
const { createApp } = require('../src/app');

const ALLOWED = 'http://localhost:5173';
const makeApp = (o = {}) => createApp({ allowedOrigins: [ALLOWED], ...o });

describe('CORS (extra)', () => {
  test('preflight from an unlisted origin is rejected', async () => {
    const res = await request(makeApp())
      .options('/api/timetables/solve')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
  });

  test('multiple allowed origins are each accepted', async () => {
    const app = makeApp({ allowedOrigins: ['http://a.test', 'http://b.test'] });
    for (const origin of ['http://a.test', 'http://b.test']) {
      const res = await request(app).get('/api/health').set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  test('origin matching is exact (a subdomain is not allowed)', async () => {
    const res = await request(makeApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173.evil.example');
    expect(res.status).toBe(403);
  });

  test('a different port on the same host is not allowed', async () => {
    const res = await request(makeApp()).get('/api/health').set('Origin', 'http://localhost:9999');
    expect(res.status).toBe(403);
  });

  test('preflight only advertises GET, POST and OPTIONS', async () => {
    const res = await request(makeApp())
      .options('/api/timetables/solve')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST');
    const methods = res.headers['access-control-allow-methods'];
    expect(methods).toMatch(/GET/);
    expect(methods).not.toMatch(/DELETE|PUT/);
  });

  test('CORS rejections are JSON', async () => {
    const res = await request(makeApp()).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('Helmet (extra)', () => {
  let res;
  beforeAll(async () => {
    res = await request(makeApp()).get('/api/health');
  });

  test('CSP forbids framing', () => {
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
  });
  test('sets a referrer policy', () => {
    expect(res.headers['referrer-policy']).toBeDefined();
  });
  test('sets Cross-Origin-Resource-Policy to same-site', () => {
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
  });
  test('sets Cross-Origin-Opener-Policy', () => {
    expect(res.headers['cross-origin-opener-policy']).toBeDefined();
  });
  test('security headers are present on error responses too', async () => {
    const notFound = await request(makeApp()).get('/api/nope');
    expect(notFound.headers['x-content-type-options']).toBe('nosniff');
  });
  test('security headers are present on 413 responses too', async () => {
    const r = await request(makeApp({ bodyLimit: '1kb' }))
      .post('/api/timetables/solve')
      .send({ pad: 'x'.repeat(5000) });
    expect(r.status).toBe(413);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Rate limiting (extra)', () => {
  test('remaining count goes down with each request', async () => {
    const app = makeApp({ rateLimit: { generalMax: 10 } });
    const first = await request(app).get('/api/health');
    const second = await request(app).get('/api/health');
    expect(Number(second.headers['ratelimit-remaining'])).toBe(
      Number(first.headers['ratelimit-remaining']) - 1,
    );
  });

  test('the 429 response is JSON with a RATE_LIMITED code', async () => {
    const app = makeApp({ rateLimit: { generalMax: 1 } });
    await request(app).get('/api/health');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  test('the solve limiter message differs from the general one', async () => {
    const app = makeApp({ rateLimit: { generalMax: 100, solveMax: 1 } });
    const body = { courses: [{ code: 'C', options: [{ id: 'a', slots: 'A1' }] }] };
    await request(app).post('/api/timetables/solve').send(body);
    const res = await request(app).post('/api/timetables/solve').send(body);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/solve/i);
  });

  test('general limiter also counts solve requests', async () => {
    const app = makeApp({ rateLimit: { generalMax: 2, solveMax: 50 } });
    const body = { courses: [{ code: 'C', options: [{ id: 'a', slots: 'A1' }] }] };
    await request(app).post('/api/timetables/solve').send(body);
    await request(app).post('/api/timetables/solve').send(body);
    const res = await request(app).post('/api/timetables/solve').send(body);
    expect(res.status).toBe(429);
  });

  test('rate-limited responses still carry security headers', async () => {
    const app = makeApp({ rateLimit: { generalMax: 1 } });
    await request(app).get('/api/health');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(429);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Payload limits (extra)', () => {
  test('a body under the limit is accepted', async () => {
    const app = makeApp({ bodyLimit: '10kb' });
    const res = await request(app)
      .post('/api/timetables/solve')
      .send({ courses: [{ code: 'C', options: [{ id: 'a', slots: 'A1' }] }] });
    expect(res.status).toBe(200);
  });

  test('a body just over the limit returns 413', async () => {
    const app = makeApp({ bodyLimit: '1kb' });
    const res = await request(app)
      .post('/api/timetables/solve')
      .send({ pad: 'x'.repeat(1100) });
    expect(res.status).toBe(413);
  });

  test('the 413 body is JSON and does not echo the payload', async () => {
    const app = makeApp({ bodyLimit: '1kb' });
    const res = await request(app)
      .post('/api/timetables/solve')
      .send({ pad: 'x'.repeat(5000) });
    expect(res.headers['content-type']).toMatch(/json/);
    expect(JSON.stringify(res.body)).not.toMatch(/xxxx/);
  });

  test('the default 100kb limit rejects a 200kb body', async () => {
    const res = await request(makeApp())
      .post('/api/timetables/solve')
      .send({ pad: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });

  test('x-powered-by is never exposed, even on errors', async () => {
    const res = await request(makeApp()).get('/api/nope');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
