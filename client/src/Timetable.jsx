import React, { useMemo } from 'react';

export default function Timetable({ chart, solution }) {
  const slotPeriods = useMemo(() => new Map(chart.slots.map((s) => [s.slot, s.periods])), [chart]);

  // periodId -> label
  const cells = useMemo(() => {
    const map = new Map();
    for (const pick of solution.picks) {
      for (const part of pick.slots.toUpperCase().split('+')) {
        for (const p of slotPeriods.get(part.trim()) || []) map.set(p, `${pick.code} · ${part.trim()}`);
      }
    }
    return map;
  }, [solution, slotPeriods]);

  const periods = Object.keys(chart.periodTimes).map(Number);

  return (
    <div className="gridScroll">
      <table className="grid">
        <thead>
          <tr>
            <th />
            {periods.map((p) => (
              <th key={p}>{chart.periodTimes[p]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.days.map((day) => (
            <tr key={day}>
              <th>{day}</th>
              {periods.map((p) => {
                const label = cells.get(`${day}-${p}`);
                return (
                  <td key={p} className={label ? 'filled' : ''}>
                    {label || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="legend">
        {solution.picks.map((p) => (
          <li key={p.code}>
            <strong>{p.code}</strong> {p.title} — {p.faculty || 'TBA'} ({p.slots})
          </li>
        ))}
      </ul>
    </div>
  );
}
