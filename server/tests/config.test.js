const { loadConfig } = require('../src/config');
const { notFound, errorHandler } = require('../src/middleware/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('loadConfig', () => {
  test('uses defaults when env is empty', () => {
    const c = loadConfig({});
    expect(c.port).toBe(5000);
    expect(c.bodyLimit).toBe('100kb');
    expect(c.allowedOrigins).toEqual(['http://localhost:5173']);
  });

  test('default rate limits are sane', () => {
    const c = loadConfig({});
    expect(c.rateLimit.windowMs).toBe(15 * 60 * 1000);
    expect(c.rateLimit.generalMax).toBe(100);
    expect(c.rateLimit.solveMax).toBe(20);
    expect(c.rateLimit.solveMax).toBeLessThan(c.rateLimit.generalMax);
  });

  test('parses PORT from env', () => {
    expect(loadConfig({ PORT: '8081' }).port).toBe(8081);
  });

  test('falls back to default for a non-numeric PORT', () => {
    expect(loadConfig({ PORT: 'abc' }).port).toBe(5000);
  });

  test('parses a comma-separated ALLOWED_ORIGINS list', () => {
    const c = loadConfig({ ALLOWED_ORIGINS: 'http://a.com, http://b.com ,http://c.com' });
    expect(c.allowedOrigins).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);
  });

  test('ignores empty entries in ALLOWED_ORIGINS', () => {
    const c = loadConfig({ ALLOWED_ORIGINS: 'http://a.com,,' });
    expect(c.allowedOrigins).toEqual(['http://a.com']);
  });

  test('reads BODY_LIMIT from env', () => {
    expect(loadConfig({ BODY_LIMIT: '1mb' }).bodyLimit).toBe('1mb');
  });

  test('reads rate-limit overrides from env', () => {
    const c = loadConfig({ RATE_WINDOW_MS: '1000', RATE_GENERAL_MAX: '5', RATE_SOLVE_MAX: '2' });
    expect(c.rateLimit).toEqual({ windowMs: 1000, generalMax: 5, solveMax: 2 });
  });
});

describe('errorHandler (unit)', () => {
  const silence = () => jest.spyOn(console, 'error').mockImplementation(() => {});

  test('maps entity.too.large to 413', () => {
    const res = mockRes();
    errorHandler({ type: 'entity.too.large' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
  });

  test('maps any error with status 413 to 413', () => {
    const res = mockRes();
    errorHandler({ status: 413 }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(413);
  });

  test('maps statusCode 413 to 413', () => {
    const res = mockRes();
    errorHandler({ statusCode: 413 }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(413);
  });

  test('maps JSON parse failures to 400', () => {
    const res = mockRes();
    errorHandler({ type: 'entity.parse.failed' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'BAD_JSON' }));
  });

  test('maps CORS rejection to 403', () => {
    const res = mockRes();
    errorHandler({ code: 'CORS_REJECTED', message: 'nope' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('passes through other 4xx statuses', () => {
    const res = mockRes();
    errorHandler({ status: 422, message: 'bad' }, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('turns unexpected errors into a generic 500 without leaking details', () => {
    const spy = silence();
    const res = mockRes();
    errorHandler(new Error('secret db password'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe('INTERNAL');
    expect(JSON.stringify(payload)).not.toMatch(/secret/);
    spy.mockRestore();
  });

  test('notFound returns a 404 JSON body', () => {
    const res = mockRes();
    notFound({}, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found', code: 'NOT_FOUND' });
  });
});
