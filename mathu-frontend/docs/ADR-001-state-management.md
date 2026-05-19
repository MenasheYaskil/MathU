# ADR-001: State Management — Zustand over Redux / Context

## Status
Accepted

## Context
The race track receives high-frequency SSE events (`POSITION_UPDATE` on every correct answer
from any participant). We need a state layer that:
1. Handles frequent partial updates without re-rendering the full component tree.
2. Persists the JWT across page reloads without boilerplate.
3. Stays simple enough that there is no dedicated store module to maintain.

## Decision
Use **Zustand** with the `persist` middleware for auth state.

- `authStore.ts` — persisted to `localStorage` via `zustand/middleware/persist`.
- `raceStore.ts` — in-memory; holds sorted leaderboard + current question.
  `updatePosition` performs a surgical single-participant update + re-sort.

## Consequences
- No Redux DevTools required (Zustand supports them optionally).
- React Context is only used if a component subtree needs non-global, scoped state.
- SSE handlers call store actions directly; components subscribe to slices via selectors.
