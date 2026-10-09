const express = require('express');
const { solve } = require('../solver/solver');
const { listSlots, PERIOD_TIMES, DAYS } = require('../solver/slots');

const MAX_COURSES = 15;
const MAX_OPTIONS_PER_COURSE = 60;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function validateCourses(courses) {
  if (!Array.isArray(courses) || courses.length === 0) throw badRequest('courses must be a non-empty array');
  if (courses.length > MAX_COURSES) throw badRequest(`At most ${MAX_COURSES} courses allowed`);
  const seen = new Set();
  courses.forEach((c, i) => {
    if (!c || typeof c.code !== 'string' || !c.code.trim()) throw badRequest(`courses[${i}].code is required`);
    if (seen.has(c.code)) throw badRequest(`Duplicate course code: ${c.code}`);
    seen.add(c.code);
    if (!Array.isArray(c.options) || c.options.length === 0) {
      throw badRequest(`courses[${i}].options must be a non-empty array`);
    }
    if (c.options.length > MAX_OPTIONS_PER_COURSE) {
      throw badRequest(`courses[${i}] has too many options (max ${MAX_OPTIONS_PER_COURSE})`);
    }
    c.options.forEach((o, j) => {
      if (!o || typeof o.slots !== 'string') throw badRequest(`courses[${i}].options[${j}].slots is required`);
    });
  });
}

function createTimetableRouter({ solveLimiter }) {
  const router = express.Router();

  router.get('/health', (req, res) => res.json({ status: 'ok' }));

  router.get('/slots', (req, res) => {
    res.json({ days: DAYS, periodTimes: PERIOD_TIMES, slots: listSlots() });
  });

  router.post('/timetables/solve', solveLimiter, (req, res, next) => {
    try {
      const { courses, constraints = {}, limit } = req.body || {};
      validateCourses(courses);
      const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
      const result = solve(courses, constraints, { limit: cappedLimit });
      res.json(result);
    } catch (err) {
      if (/Unknown slot|Empty slot/.test(err.message)) err.status = 400;
      next(err);
    }
  });

  return router;
}

module.exports = { createTimetableRouter };
