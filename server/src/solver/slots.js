/**
 * VIT FFCS slot chart (simplified: Mon-Fri, theory + lab periods).
 *
 * Each period is identified as "DAY-N" where N is 1..12:
 *   1-6  = morning periods (08:00 onward)
 *   7-12 = afternoon periods (14:00 onward)
 *
 * NOTE: Slot charts change between semesters. Verify against the current
 * VIT chart and edit THEORY_CHART / LAB_CHART below if needed. The solver
 * only depends on the slot -> periods mapping produced here.
 */

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

const PERIOD_TIMES = {
  1: '08:00-08:50',
  2: '09:00-09:50',
  3: '10:00-10:50',
  4: '11:00-11:50',
  5: '12:00-12:50',
  6: '13:00-13:50',
  7: '14:00-14:50',
  8: '15:00-15:50',
  9: '16:00-16:50',
  10: '17:00-17:50',
  11: '18:00-18:50',
  12: '19:00-19:50',
};

// Theory slots per day, listed by period 1..12. null = no theory slot.
const THEORY_CHART = {
  MON: ['A1', 'F1', 'D1', 'TB1', 'TG1', null, 'A2', 'F2', 'D2', 'TB2', 'TG2', null],
  TUE: ['B1', 'G1', 'E1', 'TC1', 'TAA1', null, 'B2', 'G2', 'E2', 'TC2', 'TAA2', null],
  WED: ['C1', 'A1', 'F1', 'V1', 'V2', null, 'C2', 'A2', 'F2', 'TD2', 'TBB2', null],
  THU: ['D1', 'B1', 'G1', 'TE1', 'TCC1', null, 'D2', 'B2', 'G2', 'TE2', 'TCC2', null],
  FRI: ['E1', 'C1', 'TA1', 'TF1', 'TD1', null, 'E2', 'C2', 'TA2', 'TF2', 'TDD2', null],
};

// Lab slots: L1..L60, 6 per half-day. Morning = L1-L30, afternoon = L31-L60.
function buildLabChart() {
  const chart = {};
  DAYS.forEach((day, d) => {
    chart[day] = [];
    for (let p = 0; p < 6; p++) chart[day].push(`L${d * 6 + p + 1}`);
    for (let p = 0; p < 6; p++) chart[day].push(`L${30 + d * 6 + p + 1}`);
  });
  return chart;
}
const LAB_CHART = buildLabChart();

/** slot name -> array of period ids, e.g. A1 -> ["MON-1", "WED-2"] */
function buildSlotMap() {
  const map = new Map();
  for (const chart of [THEORY_CHART, LAB_CHART]) {
    for (const day of DAYS) {
      chart[day].forEach((slot, i) => {
        if (!slot) return;
        if (!map.has(slot)) map.set(slot, []);
        map.get(slot).push(`${day}-${i + 1}`);
      });
    }
  }
  return map;
}

const SLOT_MAP = buildSlotMap();

function isKnownSlot(slot) {
  return SLOT_MAP.has(slot);
}

/**
 * Parse a slot expression like "A1+TA1" or "L1+L2" into a Set of period ids.
 * Throws on unknown slot names.
 */
function periodsFor(slotExpr) {
  const periods = new Set();
  const parts = String(slotExpr)
    .split('+')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) throw new Error('Empty slot expression');
  for (const part of parts) {
    if (!SLOT_MAP.has(part)) throw new Error(`Unknown slot: ${part}`);
    for (const p of SLOT_MAP.get(part)) periods.add(p);
  }
  return periods;
}

function listSlots() {
  return [...SLOT_MAP.entries()].map(([slot, periods]) => ({ slot, periods }));
}

module.exports = {
  DAYS,
  PERIOD_TIMES,
  THEORY_CHART,
  LAB_CHART,
  isKnownSlot,
  periodsFor,
  listSlots,
};
