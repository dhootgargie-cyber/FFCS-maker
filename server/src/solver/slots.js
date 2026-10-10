/**
 * Slot chart loader.
 *
 * The chart itself lives in data, not code: see slotChart.json. Slot charts
 * change every semester (and differ by campus), so swapping the chart means
 * replacing one JSON file, or pointing SLOT_CHART_PATH at another one.
 *
 * Chart format:
 *   {
 *     "meta":        { name, campus, note },          // free-form, optional
 *     "days":        ["MON", ...],
 *     "periodTimes": { "1": "08:00-08:50", ... },     // defines the period count
 *     "theory":      { "MON": [slot|null x periods], ... },
 *     "lab":         { "MON": [slot|null x periods], ... }
 *   }
 *
 * A period is identified as "DAY-N", e.g. "MON-1". A slot such as "A1" can
 * occupy several periods; the solver only needs the slot -> periods mapping.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CHART_PATH = path.join(__dirname, 'slotChart.json');

/** Throws a descriptive Error if the chart is malformed. */
function validateChart(chart) {
  const fail = (msg) => {
    throw new Error(`Invalid slot chart: ${msg}`);
  };
  if (!chart || typeof chart !== 'object') fail('chart must be an object');

  const { days, periodTimes } = chart;
  if (!Array.isArray(days) || days.length === 0) fail('"days" must be a non-empty array');
  if (new Set(days).size !== days.length) fail('"days" contains duplicates');
  if (!periodTimes || typeof periodTimes !== 'object') fail('"periodTimes" must be an object');

  const periodCount = Object.keys(periodTimes).length;
  if (periodCount === 0) fail('"periodTimes" must define at least one period');

  for (const section of ['theory', 'lab']) {
    const grid = chart[section];
    if (!grid || typeof grid !== 'object') fail(`"${section}" must be an object`);
    for (const day of days) {
      const row = grid[day];
      if (!Array.isArray(row)) fail(`${section}.${day} must be an array`);
      if (row.length !== periodCount) {
        fail(`${section}.${day} has ${row.length} entries, expected ${periodCount}`);
      }
      for (const slot of row) {
        if (slot === null) continue;
        if (typeof slot !== 'string' || !slot.trim()) fail(`${section}.${day} has a non-string slot`);
        if (slot.includes('+')) fail(`slot "${slot}" must not contain "+"`);
        if (slot !== slot.toUpperCase()) fail(`slot "${slot}" must be upper-case`);
      }
    }
  }
  return chart;
}

/** slot name -> array of period ids, e.g. A1 -> ["MON-1", "WED-2"] */
function buildSlotMap(chart) {
  const map = new Map();
  for (const section of [chart.theory, chart.lab]) {
    for (const day of chart.days) {
      section[day].forEach((slot, i) => {
        if (!slot) return;
        if (!map.has(slot)) map.set(slot, []);
        map.get(slot).push(`${day}-${i + 1}`);
      });
    }
  }
  return map;
}

function readChartFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read slot chart at ${file}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Slot chart at ${file} is not valid JSON: ${err.message}`);
  }
}

/**
 * Build a slot "engine" from a chart object. Exposed so tests (and, later,
 * per-campus charts) can create engines without touching module state.
 */
function createSlotEngine(chart) {
  validateChart(chart);
  const slotMap = buildSlotMap(chart);

  return {
    meta: chart.meta || {},
    days: chart.days,
    periodTimes: chart.periodTimes,
    isKnownSlot: (slot) => slotMap.has(slot),
    /**
     * Parse a slot expression like "A1+TA1" or "L1+L2" into a Set of period
     * ids. Throws on empty expressions and unknown slot names.
     */
    periodsFor(slotExpr) {
      const periods = new Set();
      const parts = String(slotExpr)
        .split('+')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (parts.length === 0) throw new Error('Empty slot expression');
      for (const part of parts) {
        if (!slotMap.has(part)) throw new Error(`Unknown slot: ${part}`);
        for (const p of slotMap.get(part)) periods.add(p);
      }
      return periods;
    },
    listSlots: () => [...slotMap.entries()].map(([slot, periods]) => ({ slot, periods })),
  };
}

// Default engine, loaded once at startup. A bad chart fails fast with a clear
// message instead of producing wrong timetables later.
const chartPath = process.env.SLOT_CHART_PATH || DEFAULT_CHART_PATH;
const defaultChart = readChartFile(chartPath);
const engine = createSlotEngine(defaultChart);

module.exports = {
  // Default-engine API (what the solver and routes use)
  DAYS: engine.days,
  PERIOD_TIMES: engine.periodTimes,
  CHART_META: engine.meta,
  isKnownSlot: engine.isKnownSlot,
  periodsFor: engine.periodsFor,
  listSlots: engine.listSlots,
  // Raw sections, kept for backwards compatibility
  THEORY_CHART: defaultChart.theory,
  LAB_CHART: defaultChart.lab,
  // Building blocks
  createSlotEngine,
  validateChart,
};
