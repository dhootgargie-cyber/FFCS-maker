import React, { useEffect, useState } from 'react';
import { getSlots, solveTimetable } from './api.js';
import Timetable from './Timetable.jsx';

const emptyOption = () => ({ faculty: '', slots: '' });
const emptyCourse = () => ({ code: '', title: '', credits: 3, options: [emptyOption()] });

export default function App() {
  const [chart, setChart] = useState(null);
  const [courses, setCourses] = useState([emptyCourse()]);
  const [constraints, setConstraints] = useState({ maxCredits: 27, noMorning: false, noEvening: false });
  const [result, setResult] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSlots().then(setChart).catch(() => setError('Could not reach the API. Is the server running?'));
  }, []);

  const updateCourse = (i, patch) =>
    setCourses((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const updateOption = (i, k, patch) =>
    setCourses((cs) =>
      cs.map((c, j) =>
        j === i ? { ...c, options: c.options.map((o, m) => (m === k ? { ...o, ...patch } : o)) } : c,
      ),
    );

  async function onSolve() {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const payload = {
        courses: courses.map((c) => ({
          code: c.code.trim(),
          title: c.title.trim(),
          credits: Number(c.credits) || 0,
          options: c.options
            .filter((o) => o.slots.trim())
            .map((o, k) => ({ id: `${c.code.trim()}-${k + 1}`, faculty: o.faculty.trim(), slots: o.slots.trim() })),
        })),
        constraints: {
          maxCredits: Number(constraints.maxCredits) || undefined,
          noMorning: constraints.noMorning,
          noEvening: constraints.noEvening,
        },
        limit: 10,
      };
      const data = await solveTimetable(payload);
      setResult(data);
      setIndex(0);
    } catch (e) {
      setError(e.status === 429 ? 'Too many requests. Please wait a bit and try again.' : e.message);
    } finally {
      setLoading(false);
    }
  }

  const solution = result?.solutions?.[index];

  return (
    <main className="wrap">
      <h1>FFCS Maker</h1>
      <p className="sub">Add courses with their faculty and slot options. The solver finds clash-free timetables.</p>

      <section className="card">
        <h2>Courses</h2>
        {courses.map((c, i) => (
          <div className="course" key={i}>
            <div className="row">
              <input placeholder="Code (CSE1001)" value={c.code} onChange={(e) => updateCourse(i, { code: e.target.value })} />
              <input placeholder="Title" value={c.title} onChange={(e) => updateCourse(i, { title: e.target.value })} />
              <input className="narrow" type="number" min="0" value={c.credits} onChange={(e) => updateCourse(i, { credits: e.target.value })} />
              <button className="ghost" onClick={() => setCourses((cs) => cs.filter((_, j) => j !== i))} disabled={courses.length === 1}>
                Remove
              </button>
            </div>
            {c.options.map((o, k) => (
              <div className="row opt" key={k}>
                <input placeholder="Faculty" value={o.faculty} onChange={(e) => updateOption(i, k, { faculty: e.target.value })} />
                <input placeholder="Slots (e.g. A1+TA1)" value={o.slots} onChange={(e) => updateOption(i, k, { slots: e.target.value })} />
              </div>
            ))}
            <button className="ghost" onClick={() => updateCourse(i, { options: [...c.options, emptyOption()] })}>
              + Add faculty option
            </button>
          </div>
        ))}
        <button onClick={() => setCourses((cs) => [...cs, emptyCourse()])}>+ Add course</button>
      </section>

      <section className="card">
        <h2>Constraints</h2>
        <div className="row">
          <label>
            Max credits
            <input className="narrow" type="number" value={constraints.maxCredits} onChange={(e) => setConstraints({ ...constraints, maxCredits: e.target.value })} />
          </label>
          <label>
            <input type="checkbox" checked={constraints.noMorning} onChange={(e) => setConstraints({ ...constraints, noMorning: e.target.checked })} />
            No morning classes
          </label>
          <label>
            <input type="checkbox" checked={constraints.noEvening} onChange={(e) => setConstraints({ ...constraints, noEvening: e.target.checked })} />
            No afternoon/evening classes
          </label>
        </div>
        <button className="primary" onClick={onSolve} disabled={loading}>
          {loading ? 'Solving…' : 'Generate timetables'}
        </button>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {result && result.solutions.length === 0 && (
        <p className="error">{result.reason || 'No clash-free timetable exists for these options.'}</p>
      )}

      {solution && chart && (
        <section className="card">
          <div className="row between">
            <h2>
              Timetable {index + 1} of {result.solutions.length} · {solution.credits} credits
            </h2>
            <div>
              <button className="ghost" onClick={() => setIndex((n) => Math.max(0, n - 1))} disabled={index === 0}>Prev</button>
              <button className="ghost" onClick={() => setIndex((n) => Math.min(result.solutions.length - 1, n + 1))} disabled={index === result.solutions.length - 1}>Next</button>
            </div>
          </div>
          <Timetable chart={chart} solution={solution} />
        </section>
      )}
    </main>
  );
}
