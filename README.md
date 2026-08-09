# Whiteout Rally Timer

A small web app for coordinating rally marches in **Whiteout Survival**. Enter
each player's march time and a target impact moment, and the app computes when
every march must launch so they all land on target at the same time — with live
countdowns and a chime when it's time to send each march.

## Features

- **Launch order** — marches are sorted so the slowest (longest march) leaves
  first; each row shows its exact launch clock time and a live countdown.
- **Target control** — set the rally impact with quick presets (1:00 / 3:00 /
  5:00) or nudge it ±15s.
- **Launch chime** — an optional beep fires the moment a march becomes due.
- Flexible march-time input: `ss`, `mm:ss`, or `h:mm:ss`.

## Tech stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + TypeScript
- [Vitest](https://vitest.dev/) for unit tests, ESLint for linting

## Getting started

```bash
npm ci          # install dependencies (or `npm install`)
npm run dev     # start the dev server on http://localhost:5173
```

## Useful scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Vite dev server (binds `0.0.0.0`)   |
| `npm run build`     | Type-check and build the production bundle    |
| `npm run preview`   | Serve the production build locally            |
| `npm test`          | Run the Vitest unit tests                     |
| `npm run typecheck` | Type-check without emitting                   |
| `npm run lint`      | Run ESLint                                     |

## How the timing works

For every march to arrive at the target time `T`, a march that takes `d` seconds
must launch at `T − d`. The app applies this per march, sorts by launch time, and
recomputes the countdowns a few times per second. See `src/rally.ts` (covered by
`src/rally.test.ts`).

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm ci` and runs the dev
server (`npm run dev`) in a `dev-server` terminal, exposing port `5173`.
