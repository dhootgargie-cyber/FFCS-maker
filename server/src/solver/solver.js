const { periodsFor } = require('./slots');

/**
 * Timetable generation as a constraint satisfaction problem.
 *
 *  Variables : one per course
 *  Domain    : that course's registration options (faculty + slot expression)
 *  Constraint: no two chosen options may share a period (clash-free)
 *  Extras    : max total credits, banned slots, preferred / avoided faculty,
 *              "no morning" / "no evening" period filters
 *
 * Search: backtracking with MRV (smallest domain first) and forward checking.
 */

const MORNING = new Set([1, 2, 3, 4, 5, 6]);

function periodNumber(periodId) {
  return Number(periodId.split('-')[1]);
}

function prepareOption(option, constraints) {
  const periods = periodsFor(option.slots);
  const banned = (constraints.bannedSlots || []).map((s) => s.toUpperCase());
  const slotParts = option.slots.toUpperCase().split('+').map((s) => s.trim());
  if (slotParts.some((s) => banned.includes(s))) return null;

  if (constraints.noMorning && [...periods].some((p) => MORNING.has(periodNumber(p)))) return null;
  if (constraints.noEvening && [...periods].some((p) => !MORNING.has(periodNumber(p)))) return null;

  const avoid = (constraints.avoidFaculty || []).map((f) => f.toLowerCase());
  if (avoid.includes(String(option.faculty || '').toLowerCase())) return null;

  return { ...option, periods };
}

function overlaps(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const p of small) if (large.has(p)) return true;
  return false;
}

/** Score used to rank solutions: higher is better. */
function score(solution, constraints) {
  let s = 0;
  const preferred = (constraints.preferredFaculty || []).map((f) => f.toLowerCase());
  for (const pick of solution) {
    if (preferred.includes(String(pick.faculty || '').toLowerCase())) s += 10;
  }
  return s;
}

function solve(courses, constraints = {}, { limit = 10, maxNodes = 200000 } = {}) {
  const maxCredits = constraints.maxCredits ?? Infinity;

  // Build domains, dropping options that violate unary constraints.
  const domains = courses.map((course) => ({
    course,
    options: course.options
      .map((o) => prepareOption(o, constraints))
      .filter(Boolean),
  }));

  const empty = domains.find((d) => d.options.length === 0);
  if (empty) {
    return { solutions: [], exhausted: true, nodes: 0, reason: `No usable options for ${empty.course.code}` };
  }

  const solutions = [];
  let nodes = 0;
  let aborted = false;

  function search(remaining, chosen, used, credits) {
    if (aborted || solutions.length >= limit * 5) return;
    if (remaining.length === 0) {
      solutions.push({
        picks: chosen.map((c) => ({
          code: c.course.code,
          title: c.course.title,
          optionId: c.option.id,
          faculty: c.option.faculty,
          slots: c.option.slots,
        })),
        credits,
      });
      return;
    }
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }

    // Forward checking: filter each remaining domain against used periods.
    const filtered = remaining.map((d) => ({
      ...d,
      options: d.options.filter((o) => !overlaps(o.periods, used)),
    }));
    if (filtered.some((d) => d.options.length === 0)) return;

    // MRV: pick the most constrained variable.
    filtered.sort((a, b) => a.options.length - b.options.length);
    const [next, ...rest] = filtered;

    const courseCredits = next.course.credits || 0;
    if (credits + courseCredits > maxCredits) return;

    for (const option of next.options) {
      const nextUsed = new Set([...used, ...option.periods]);
      search(rest, [...chosen, { course: next.course, option }], nextUsed, credits + courseCredits);
    }
  }

  search(domains, [], new Set(), 0);

  solutions.sort((a, b) => score(b.picks, constraints) - score(a.picks, constraints));
  return {
    solutions: solutions.slice(0, limit),
    exhausted: !aborted && solutions.length < limit * 5,
    nodes,
  };
}

module.exports = { solve };
