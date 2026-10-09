const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp({ allowedOrigins: ['http://localhost:5173'], rateLimit: { generalMax: 1000, solveMax: 1000 } });
const solve = (body) => request(app).post('/api/timetables/solve').send(body);
const opt = (id, slots, faculty = 'F') => ({ id, faculty, slots });
const course = (code, options) => ({ code, credits: 3, options });

describe('POST /api/timetables/solve validation', () => {
  test('rejects an empty courses array', async () => {
    expect((await solve({ courses: [] })).status).toBe(400);
  });

  test('rejects courses that is not an array', async () => {
    expect((await solve({ courses: 'CSE1001' })).status).toBe(400);
  });

  test('rejects an empty request body', async () => {
    expect((await solve({})).status).toBe(400);
  });

  test('rejects a course with no code', async () => {
    const res = await solve({ courses: [{ options: [opt('a', 'A1')] }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code/);
  });

  test('rejects a course with a blank code', async () => {
    expect((await solve({ courses: [course('  ', [opt('a', 'A1')])] })).status).toBe(400);
  });

  test('rejects a course with a non-string code', async () => {
    expect((await solve({ courses: [course(123, [opt('a', 'A1')])] })).status).toBe(400);
  });

  test('rejects a course with no options', async () => {
    expect((await solve({ courses: [course('C1', [])] })).status).toBe(400);
  });

  test('rejects an option without slots', async () => {
    const res = await solve({ courses: [course('C1', [{ id: 'a', faculty: 'F' }])] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slots/);
  });

  test('rejects an option whose slots is not a string', async () => {
    expect((await solve({ courses: [course('C1', [opt('a', ['A1'])])] })).status).toBe(400);
  });

  test('rejects a course with more than 60 options', async () => {
    const options = Array.from({ length: 61 }, (_, i) => opt(`o${i}`, 'A1'));
    const res = await solve({ courses: [course('C1', options)] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too many options/);
  });

  test('accepts exactly 15 courses', async () => {
    const slots = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'L1'];
    const courses = slots.map((s, i) => course(`C${i}`, [opt('a', s)]));
    const res = await solve({ courses });
    expect(res.status).toBe(200);
  });

  test('error responses are JSON with a code field', async () => {
    const res = await solve({});
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('code');
  });

  test('an empty slot expression is rejected', async () => {
    const res = await solve({ courses: [course('C1', [opt('a', '+')])] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/timetables/solve behaviour', () => {
  test('limit=1 returns a single solution', async () => {
    const res = await solve({
      courses: [course('C1', [opt('a', 'A1'), opt('b', 'B1'), opt('c', 'C1')])],
      limit: 1,
    });
    expect(res.body.solutions).toHaveLength(1);
  });

  test('a non-numeric limit falls back to the default', async () => {
    const res = await solve({ courses: [course('C1', [opt('a', 'A1')])], limit: 'lots' });
    expect(res.status).toBe(200);
  });

  test('constraints are applied through the API', async () => {
    const res = await solve({
      courses: [course('C1', [opt('a', 'A1'), opt('b', 'B1')])],
      constraints: { bannedSlots: ['A1'] },
    });
    expect(res.body.solutions.map((s) => s.picks[0].optionId)).toEqual(['b']);
  });

  test('credits in the response are the sum of course credits', async () => {
    const res = await solve({
      courses: [
        { code: 'C1', credits: 4, options: [opt('a', 'A1')] },
        { code: 'C2', credits: 2, options: [opt('b', 'B1')] },
      ],
    });
    expect(res.body.solutions[0].credits).toBe(6);
  });

  test('returns an empty solution list, not an error, when everything clashes', async () => {
    const res = await solve({
      courses: [course('C1', [opt('a', 'A1')]), course('C2', [opt('b', 'A1')])],
    });
    expect(res.status).toBe(200);
    expect(res.body.solutions).toEqual([]);
  });
});

describe('GET endpoints', () => {
  test('/api/health returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('/api/slots includes days and period times', async () => {
    const res = await request(app).get('/api/slots');
    expect(res.body.days).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(Object.keys(res.body.periodTimes)).toHaveLength(12);
  });

  test('/api/slots lists A1 with its periods', async () => {
    const res = await request(app).get('/api/slots');
    const a1 = res.body.slots.find((s) => s.slot === 'A1');
    expect(a1.periods).toEqual(expect.arrayContaining(['MON-1', 'WED-2']));
  });

  test('GET on the solve route is not allowed', async () => {
    expect((await request(app).get('/api/timetables/solve')).status).toBe(404);
  });
});
