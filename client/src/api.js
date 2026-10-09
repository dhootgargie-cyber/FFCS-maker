const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }
  return body;
}

export const getSlots = () => request('/api/slots');

export const solveTimetable = (payload) =>
  request('/api/timetables/solve', { method: 'POST', body: JSON.stringify(payload) });
