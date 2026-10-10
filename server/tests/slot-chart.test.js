const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSlotEngine, validateChart, periodsFor, DAYS, CHART_META } = require('../src/solver/slots');
const defaultChart = require('../src/solver/slotChart.json');

const clone = (o) => JSON.parse(JSON.stringify(o));

// A tiny 2-day, 2-period chart for isolated tests.
const tiny = () => ({
  meta: { name: 'tiny' },
  days: ['MON', 'TUE'],
  periodTimes: { 1: '08:00-08:50', 2: '09:00-09:50' },
  theory: { MON: ['X1', 'Y1'], TUE: ['Y1', null] },
  lab: { MON: ['L1', 'L2'], TUE: ['L3', 'L4'] },
});

describe('default slotChart.json', () => {
  test('passes validation', () => {
    expect(() => validateChart(defaultChart)).not.toThrow();
  });

  test('exposes chart metadata', () => {
    expect(CHART_META.name).toMatch(/chart/i);
    expect(CHART_META.note).toBeDefined();
  });

  test('days come from the chart file', () => {
    expect(DAYS).toEqual(defaultChart.days);
  });

  test('the default engine agrees with the JSON for a sample slot', () => {
    const idx = defaultChart.theory.MON.indexOf('A1');
    expect([...periodsFor('A1')]).toContain(`MON-${idx + 1}`);
  });
});

describe('createSlotEngine', () => {
  test('builds slot -> period mappings from a custom chart', () => {
    const e = createSlotEngine(tiny());
    expect([...e.periodsFor('Y1')].sort()).toEqual(['MON-2', 'TUE-1']);
  });

  test('knows only the slots in its own chart', () => {
    const e = createSlotEngine(tiny());
    expect(e.isKnownSlot('X1')).toBe(true);
    expect(e.isKnownSlot('A1')).toBe(false);
    expect(() => e.periodsFor('A1')).toThrow(/Unknown slot: A1/);
  });

  test('combines "+" expressions using its own chart', () => {
    const e = createSlotEngine(tiny());
    expect([...e.periodsFor('X1+L4')].sort()).toEqual(['MON-1', 'TUE-2']);
  });

  test('is case-insensitive and tolerates whitespace', () => {
    const e = createSlotEngine(tiny());
    expect([...e.periodsFor(' x1 + y1 ')].sort()).toEqual([...e.periodsFor('X1+Y1')].sort());
  });

  test('null cells create no slot', () => {
    const e = createSlotEngine(tiny());
    expect(e.listSlots().some((s) => s.slot === 'null')).toBe(false);
  });

  test('engines are independent of each other and of the default one', () => {
    const a = createSlotEngine(tiny());
    const other = tiny();
    other.theory.MON[0] = 'Z9';
    const b = createSlotEngine(other);
    expect(a.isKnownSlot('Z9')).toBe(false);
    expect(b.isKnownSlot('Z9')).toBe(true);
    expect(periodsFor).toBeDefined();
    expect(() => periodsFor('Z9')).toThrow();
  });

  test('a longer day (more periods) works when periodTimes grows with it', () => {
    const c = tiny();
    c.periodTimes[3] = '10:00-10:50';
    c.theory.MON.push('W1');
    c.theory.TUE.push(null);
    c.lab.MON.push('L5');
    c.lab.TUE.push('L6');
    expect([...createSlotEngine(c).periodsFor('W1')]).toEqual(['MON-3']);
  });
});

describe('validateChart', () => {
  test('rejects a non-object', () => {
    expect(() => validateChart(null)).toThrow(/Invalid slot chart/);
  });

  test('rejects missing days', () => {
    const c = tiny();
    delete c.days;
    expect(() => validateChart(c)).toThrow(/days/);
  });

  test('rejects duplicate days', () => {
    const c = tiny();
    c.days = ['MON', 'MON'];
    expect(() => validateChart(c)).toThrow(/duplicates/);
  });

  test('rejects missing periodTimes', () => {
    const c = tiny();
    delete c.periodTimes;
    expect(() => validateChart(c)).toThrow(/periodTimes/);
  });

  test('rejects a missing theory section', () => {
    const c = tiny();
    delete c.theory;
    expect(() => validateChart(c)).toThrow(/theory/);
  });

  test('rejects a day with no row', () => {
    const c = tiny();
    delete c.lab.TUE;
    expect(() => validateChart(c)).toThrow(/lab\.TUE/);
  });

  test('rejects a row of the wrong length', () => {
    const c = tiny();
    c.theory.MON = ['X1'];
    expect(() => validateChart(c)).toThrow(/expected 2/);
  });

  test('rejects a non-string slot', () => {
    const c = tiny();
    c.theory.MON[0] = 42;
    expect(() => validateChart(c)).toThrow(/non-string/);
  });

  test('rejects a slot containing "+"', () => {
    const c = tiny();
    c.theory.MON[0] = 'A1+B1';
    expect(() => validateChart(c)).toThrow(/"\+"/);
  });

  test('rejects lower-case slot names', () => {
    const c = tiny();
    c.theory.MON[0] = 'x1';
    expect(() => validateChart(c)).toThrow(/upper-case/);
  });

  test('createSlotEngine validates before building', () => {
    const c = clone(tiny());
    c.theory.MON = [];
    expect(() => createSlotEngine(c)).toThrow(/Invalid slot chart/);
  });
});

describe('SLOT_CHART_PATH override', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'slotchart-'));

  function loadFresh(env) {
    let mod;
    const saved = process.env.SLOT_CHART_PATH;
    if (env === undefined) delete process.env.SLOT_CHART_PATH;
    else process.env.SLOT_CHART_PATH = env;
    try {
      jest.isolateModules(() => {
        mod = require('../src/solver/slots');
      });
    } finally {
      if (saved === undefined) delete process.env.SLOT_CHART_PATH;
      else process.env.SLOT_CHART_PATH = saved;
    }
    return mod;
  }

  test('loads a chart from the path in the environment', () => {
    const file = path.join(tmp(), 'chart.json');
    fs.writeFileSync(file, JSON.stringify(tiny()));
    const mod = loadFresh(file);
    expect(mod.isKnownSlot('X1')).toBe(true);
    expect(mod.isKnownSlot('A1')).toBe(false);
    expect(mod.DAYS).toEqual(['MON', 'TUE']);
  });

  test('fails fast when the file does not exist', () => {
    expect(() => loadFresh(path.join(tmp(), 'missing.json'))).toThrow(/Cannot read slot chart/);
  });

  test('fails fast on invalid JSON', () => {
    const file = path.join(tmp(), 'bad.json');
    fs.writeFileSync(file, '{ not json');
    expect(() => loadFresh(file)).toThrow(/not valid JSON/);
  });

  test('fails fast on a structurally invalid chart', () => {
    const file = path.join(tmp(), 'bad-shape.json');
    fs.writeFileSync(file, JSON.stringify({ days: [] }));
    expect(() => loadFresh(file)).toThrow(/Invalid slot chart/);
  });

  test('falls back to the bundled chart when the variable is unset', () => {
    const mod = loadFresh(undefined);
    expect(mod.isKnownSlot('A1')).toBe(true);
  });
});
