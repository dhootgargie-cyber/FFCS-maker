const { periodsFor, listSlots, isKnownSlot } = require('../src/solver/slots');
const { solve } = require('../src/solver/solver');

const opt = (id, slots, faculty = 'F') => ({ id, faculty, slots });
const course = (code, options, credits = 3) => ({ code, credits, options });

describe('slot parsing edge cases', () => {
  test('tolerates whitespace around "+"', () => {
    expect([...periodsFor(' A1 + TA1 ')].sort()).toEqual([...periodsFor('A1+TA1')].sort());
  });

  test('rejects an empty expression', () => {
    expect(() => periodsFor('')).toThrow(/Empty slot/);
  });

  test('rejects "+" with nothing around it', () => {
    expect(() => periodsFor('+')).toThrow(/Empty slot/);
  });

  test('rejects an unknown part inside a combined expression', () => {
    expect(() => periodsFor('A1+ZZ9')).toThrow(/Unknown slot: ZZ9/);
  });

  test('isKnownSlot recognises real slots only', () => {
    expect(isKnownSlot('A1')).toBe(true);
    expect(isKnownSlot('L60')).toBe(true);
    expect(isKnownSlot('L61')).toBe(false);
  });

  test('all 60 lab slots exist and map to exactly one period', () => {
    for (let i = 1; i <= 60; i++) {
      expect(periodsFor(`L${i}`).size).toBe(1);
    }
  });

  test('no two lab slots share a period', () => {
    const seen = new Set();
    for (let i = 1; i <= 60; i++) {
      const [p] = [...periodsFor(`L${i}`)];
      expect(seen.has(p)).toBe(false);
      seen.add(p);
    }
    expect(seen.size).toBe(60);
  });

  test('every period id is of the form DAY-N with N between 1 and 12', () => {
    for (const { periods } of listSlots()) {
      for (const p of periods) {
        expect(p).toMatch(/^(MON|TUE|WED|THU|FRI)-(?:[1-9]|1[0-2])$/);
      }
    }
  });

  test('the same slot always expands to the same periods', () => {
    expect([...periodsFor('B1')]).toEqual([...periodsFor('B1')]);
  });
});

describe('solver: theory and lab interaction', () => {
  test('a lab slot clashes with a theory slot in the same period', () => {
    // A1 and L1 both occupy MON-1
    const courses = [course('T', [opt('t', 'A1')]), course('L', [opt('l', 'L1')])];
    expect(solve(courses).solutions).toHaveLength(0);
  });

  test('a lab slot in a free period does not clash with theory', () => {
    // L2 is MON-2, which A1 does not use
    const courses = [course('T', [opt('t', 'A1')]), course('L', [opt('l', 'L2')])];
    expect(solve(courses).solutions).toHaveLength(1);
  });

  test('partial overlap in a combined slot is still a clash', () => {
    // A1+TA1 and TA1+B1 share TA1
    const courses = [course('X', [opt('x', 'A1+TA1')]), course('Y', [opt('y', 'TA1+B1')])];
    expect(solve(courses).solutions).toHaveLength(0);
  });

  test('two courses on disjoint slots both fit', () => {
    const courses = [course('X', [opt('x', 'A1+TA1')]), course('Y', [opt('y', 'B1+TB1')])];
    expect(solve(courses).solutions).toHaveLength(1);
  });
});

describe('solver: constraints', () => {
  test('noEvening removes afternoon options', () => {
    const courses = [course('C', [opt('m', 'A1'), opt('e', 'A2')])];
    const { solutions } = solve(courses, { noEvening: true });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['m']);
  });

  test('noMorning and noEvening together leave nothing', () => {
    const courses = [course('C', [opt('m', 'A1'), opt('e', 'A2')])];
    const r = solve(courses, { noMorning: true, noEvening: true });
    expect(r.solutions).toHaveLength(0);
    expect(r.reason).toMatch(/C/);
  });

  test('bannedSlots is case-insensitive', () => {
    const courses = [course('C', [opt('a', 'A1'), opt('b', 'B1')])];
    const { solutions } = solve(courses, { bannedSlots: ['a1'] });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['b']);
  });

  test('bannedSlots matches a slot inside a combined expression', () => {
    const courses = [course('C', [opt('a', 'A1+TA1'), opt('b', 'B1+TB1')])];
    const { solutions } = solve(courses, { bannedSlots: ['TA1'] });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['b']);
  });

  test('avoidFaculty is case-insensitive', () => {
    const courses = [course('C', [opt('a', 'A1', 'Dr Rao'), opt('b', 'B1', 'Dr Sen')])];
    const { solutions } = solve(courses, { avoidFaculty: ['DR RAO'] });
    expect(solutions.map((s) => s.picks[0].optionId)).toEqual(['b']);
  });

  test('maxCredits equal to the total is allowed', () => {
    const courses = [course('X', [opt('x', 'A1')], 4), course('Y', [opt('y', 'B1')], 3)];
    expect(solve(courses, { maxCredits: 7 }).solutions).toHaveLength(1);
  });

  test('maxCredits of 0 allows no courses with credits', () => {
    const courses = [course('X', [opt('x', 'A1')], 3)];
    expect(solve(courses, { maxCredits: 0 }).solutions).toHaveLength(0);
  });

  test('a missing credits value counts as 0', () => {
    const courses = [{ code: 'X', options: [opt('x', 'A1')] }];
    const { solutions } = solve(courses, { maxCredits: 0 });
    expect(solutions).toHaveLength(1);
    expect(solutions[0].credits).toBe(0);
  });

  test('preferred faculty are ranked ahead across multiple courses', () => {
    const courses = [
      course('X', [opt('x1', 'A1', 'Dr A'), opt('x2', 'B1', 'Dr B')]),
      course('Y', [opt('y1', 'C1', 'Dr C'), opt('y2', 'D1', 'Dr D')]),
    ];
    const { solutions } = solve(courses, { preferredFaculty: ['Dr B', 'Dr D'] });
    const ids = solutions[0].picks.map((p) => p.optionId).sort();
    expect(ids).toEqual(['x2', 'y2']);
  });
});

describe('solver: search behaviour', () => {
  test('an empty course list yields one empty timetable', () => {
    const r = solve([]);
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0].picks).toEqual([]);
  });

  test('returns every combination when there are no clashes', () => {
    const courses = [
      course('X', [opt('x1', 'A1'), opt('x2', 'B1')]),
      course('Y', [opt('y1', 'C1'), opt('y2', 'D1')]),
    ];
    expect(solve(courses, {}, { limit: 10 }).solutions).toHaveLength(4);
  });

  test('every pick in a timetable belongs to a different course', () => {
    const courses = [
      course('X', [opt('x1', 'A1'), opt('x2', 'B1')]),
      course('Y', [opt('y1', 'C1'), opt('y2', 'D1')]),
      course('Z', [opt('z1', 'E1'), opt('z2', 'F1')]),
    ];
    for (const s of solve(courses).solutions) {
      expect(new Set(s.picks.map((p) => p.code)).size).toBe(3);
    }
  });

  test('no returned timetable contains overlapping periods', () => {
    const courses = [
      course('X', [opt('x1', 'A1+TA1'), opt('x2', 'B1+TB1'), opt('x3', 'C1+TC1')]),
      course('Y', [opt('y1', 'A1+TA1'), opt('y2', 'D1+TD1'), opt('y3', 'B1+TB1')]),
      course('Z', [opt('z1', 'E1'), opt('z2', 'A1')]),
    ];
    const { solutions } = solve(courses);
    expect(solutions.length).toBeGreaterThan(0);
    for (const s of solutions) {
      const seen = new Set();
      for (const pick of s.picks) {
        for (const p of periodsFor(pick.slots)) {
          expect(seen.has(p)).toBe(false);
          seen.add(p);
        }
      }
    }
  });

  test('picks carry the course title and faculty through', () => {
    const courses = [{ code: 'X', title: 'Algebra', credits: 3, options: [opt('x', 'A1', 'Dr Q')] }];
    const pick = solve(courses).solutions[0].picks[0];
    expect(pick).toMatchObject({ code: 'X', title: 'Algebra', faculty: 'Dr Q', slots: 'A1' });
  });

  test('stops early and reports non-exhaustive when the node budget is hit', () => {
    const courses = [
      course('X', [opt('x1', 'A1'), opt('x2', 'B1')]),
      course('Y', [opt('y1', 'C1'), opt('y2', 'D1')]),
      course('Z', [opt('z1', 'E1'), opt('z2', 'F1')]),
    ];
    const r = solve(courses, {}, { maxNodes: 1 });
    expect(r.exhausted).toBe(false);
  });

  test('a normal search reports exhausted: true', () => {
    const courses = [course('X', [opt('x1', 'A1')])];
    expect(solve(courses).exhausted).toBe(true);
  });

  test('forward checking prunes dead branches quickly', () => {
    // Y has only one option and it clashes with every X option, so the
    // search should give up after very few nodes.
    const courses = [
      course('X', [opt('x1', 'A1'), opt('x2', 'A1'), opt('x3', 'A1')]),
      course('Y', [opt('y1', 'A1')]),
    ];
    const r = solve(courses);
    expect(r.solutions).toHaveLength(0);
    expect(r.nodes).toBeLessThanOrEqual(2);
  });

  test('throws on an unknown slot (the API turns this into a 400)', () => {
    expect(() => solve([course('X', [opt('x', 'NOPE1')])])).toThrow(/Unknown slot/);
  });
});
