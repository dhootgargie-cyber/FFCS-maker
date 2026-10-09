const request = require('supertest');
const { createApp } = require('../src/app');
const { periodsFor } = require('../src/solver/slots');
const { solve } = require('../src/solver/solver');

const opt = (id, faculty, slots) => ({ id, faculty, slots });

describe('slot chart', () => {
  test('expands a slot into its periods', () => {
    expect([...periodsFor('A1')]).toEqual(expect.arrayContaining(['MON-1', 'WED-2']));
  });
  test('combines "+" slot expressions', () => {
    const p = periodsFor('A1+TA1');
    expect(p.has('MON-1')).toBe(true);
    expect(p.has('FRI-3')).toBe(true);
  });
  test('is case-insensitive', () => {
    expect([...periodsFor('a1')]).toEqual([...periodsFor('A1')]);
  });
  test('throws on unknown slots', () => {
    expect(() => periodsFor('ZZ9')).toThrow(/Unknown slot/);
  });
  test('lab slots map to a single period', () => {
    expect(periodsFor('L1').size).toBe(1);
  });
  test('theory A1 and lab L1 are separate slot families', () => {
    expect(periodsFor('A1').has('MON-1')).toBe(true);
    expect(periodsFor('L1').has('MON-1')).toBe(true); // both occupy Mon period 1 -> clash
  });
});

describe('solver', () => {
  test('finds a clash-free combination', () => {
    const courses = [
      { code: 'C1', credits: 3, options: [opt('a', 'F1', 'A1+TA1'), opt('b', 'F2', 'B1+TB1')] },
      { code: 'C2', credits: 3, options: [opt('c', 'F3', 'A1+TA1'), opt('d', 'F4', 'C1+TC1')] },
    ];
    const { solutions } = solve(courses);
    expect(solutions.length).toBeGreaterThan(0);
    for (const s of solutions) {
      const slots = s.picks.map((p) => p.slots);
      expect(new Set(slots).size).toBe(slots.length);
    }
    // a+c share slots and must never be paired
    expect(solutions.some((s) => s.picks.map((p) => p.optionId).sort().join() === 'a,c')).toBe(false);
  });

  test('returns no solutions when every pairing clashes', () => {
    const courses = [
      { code: 'C1', credits: 3, options: [opt('a', 'F1', 'A1')] },
      { code: 'C2', credits: 3, options: [opt('b', 'F2', 'A1')] },
    ];
    expect(solve(courses).solutions).toHaveLength(0);
  });

  test('respects maxCredits', () => {
    const courses = [
      { code: 'C1', credits: 4, options: [opt('a', 'F1', 'A1')] },
      { code: 'C2', credits: 4, options: [opt('b', 'F2', 'B1')] },
    ];
    expect(solve(courses, { maxCredits: 7 }).solutions).toHaveLength(0);
    expect(solve(courses, { maxCredits: 8 }).solutions).toHaveLength(1);
  });

  test('bannedSlots removes options', () => {
    const courses = [{ code: 'C1', credits: 3, options: [opt('a', 'F1', 'A1'), opt('b', 'F2', 'B1')] }];
    const { solutions } = solve(courses, { bannedSlots: ['A1'] });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['b']);
  });

  test('avoidFaculty removes options', () => {
    const courses = [{ code: 'C1', credits: 3, options: [opt('a', 'Dr X', 'A1'), opt('b', 'Dr Y', 'B1')] }];
    const { solutions } = solve(courses, { avoidFaculty: ['dr x'] });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['b']);
  });

  test('preferredFaculty ranks solutions first', () => {
    const courses = [{ code: 'C1', credits: 3, options: [opt('a', 'Dr X', 'A1'), opt('b', 'Dr Y', 'B1')] }];
    const { solutions } = solve(courses, { preferredFaculty: ['Dr Y'] });
    expect(solutions[0].picks[0].optionId).toBe('b');
  });

  test('noMorning excludes morning periods', () => {
    const courses = [{ code: 'C1', credits: 3, options: [opt('m', 'F', 'A1'), opt('e', 'F', 'A2')] }];
    const { solutions } = solve(courses, { noMorning: true });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['e']);
  });

  test('reports a reason when a course has no usable option', () => {
    const courses = [{ code: 'C1', credits: 3, options: [opt('a', 'F', 'A1')] }];
    const r = solve(courses, { bannedSlots: ['A1'] });
    expect(r.solutions).toHaveLength(0);
    expect(r.reason).toMatch(/C1/);
  });

  test('honours the solution limit', () => {
    const courses = [
      { code: 'C1', credits: 3, options: [opt('a', 'F', 'A1'), opt('b', 'F', 'B1'), opt('c', 'F', 'C1')] },
      { code: 'C2', credits: 3, options: [opt('d', 'F', 'D1'), opt('e', 'F', 'E1'), opt('f', 'F', 'F1')] },
    ];
    expect(solve(courses, {}, { limit: 3 }).solutions).toHaveLength(3);
  });
});

describe('POST /api/timetables/solve', () => {
  const app = createApp({ allowedOrigins: ['http://localhost:5173'] });

  test('returns solutions for valid input', async () => {
    const res = await request(app)
      .post('/api/timetables/solve')
      .send({ courses: [{ code: 'C1', credits: 3, options: [opt('a', 'F', 'A1+TA1')] }] });
    expect(res.status).toBe(200);
    expect(res.body.solutions).toHaveLength(1);
  });

  test('rejects missing courses with 400', async () => {
    const res = await request(app).post('/api/timetables/solve').send({});
    expect(res.status).toBe(400);
  });

  test('rejects duplicate course codes with 400', async () => {
    const c = { code: 'C1', options: [opt('a', 'F', 'A1')] };
    const res = await request(app).post('/api/timetables/solve').send({ courses: [c, c] });
    expect(res.status).toBe(400);
  });

  test('rejects unknown slots with 400', async () => {
    const res = await request(app)
      .post('/api/timetables/solve')
      .send({ courses: [{ code: 'C1', options: [opt('a', 'F', 'ZZ9')] }] });
    expect(res.status).toBe(400);
  });

  test('rejects more than 15 courses with 400', async () => {
    const courses = Array.from({ length: 16 }, (_, i) => ({ code: `C${i}`, options: [opt('a', 'F', 'A1')] }));
    const res = await request(app).post('/api/timetables/solve').send({ courses });
    expect(res.status).toBe(400);
  });

  test('GET /api/slots lists the chart', async () => {
    const res = await request(app).get('/api/slots');
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(50);
  });
});
