# FFCS Maker
<img width="1332" alt="FFCS Maker Timetable" src="https://github.com/user-attachments/assets/c7f4149b-2ed2-44e7-98d5-fd8427f1333f" />


Timetable constraint-satisfaction platform for VIT's Fully Flexible Credit System. Pick courses, add the faculty/slot options you can register for, and the solver returns clash-free timetables.

**Stack:** React (Vite), Node.js, Express, Docker

## How it works

Timetable generation is modelled as a constraint satisfaction problem:

- **Variables:** one per course
- **Domain:** that course's faculty + slot options (e.g. `A1+TA1`, `L1+L2`)
- **Constraints:** no two chosen options share a period; max credits; banned slots; avoided/preferred faculty; no-morning / no-afternoon
- **Search:** backtracking with MRV variable ordering and forward checking

## Backend hardening

- **CORS allowlist** (`ALLOWED_ORIGINS`), unlisted origins get 403
- **Helmet** security headers incl. a restrictive CSP
- **Tiered rate limiting:** general limiter plus a stricter one on `/api/timetables/solve`; limiter state is created per app instance
- **Payload limit** (`BODY_LIMIT`, default 100kb): oversized bodies return **413**, malformed JSON returns **400**, instead of a generic 500
- Input validation on course/option counts and slot names

## Run locally

```bash
# API
cd server && npm install && npm start      # http://localhost:5000

# Client (separate terminal)
cd client && npm install && npm run dev    # http://localhost:5173
```

## Run with Docker

```bash
docker compose up --build                  # http://localhost:8080
```

## Tests

```bash
cd server && npm test
```

Covers CORS behaviour, security headers, rate-limiter isolation, payload limits, slot parsing, solver correctness, and API validation.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |
| GET | `/api/slots` | Slot chart and period times |
| POST | `/api/timetables/solve` | Body: `{ courses, constraints, limit }` |

## Slot chart

The chart in `server/src/solver/slots.js` is a simplified Mon-Fri model written from memory. **Verify it against the current VIT slot chart for your semester** and edit `THEORY_CHART` / `LAB_CHART` if needed. The solver only depends on the slot-to-period mapping.
