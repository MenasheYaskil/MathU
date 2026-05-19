# MathU Frontend — Claude Code Config

## Purpose
React 18 + Vite + TypeScript frontend for the MathU Racing Game.
Connects to the Spring Boot backend (proxied via Vite at `/api` → `http://localhost:8080`).

## Map
```
src/
  features/teacher/   — Teacher bounded context (dashboard, race management)
  features/student/   — Student bounded context (join lobby, live race track)
  services/           — apiService.ts (REST) + sseService.ts (EventSource)
  stores/             — authStore.ts (persisted JWT) + raceStore.ts (live game state)
  types/api.ts        — Shared TypeScript interfaces mirroring backend DTOs
  shared/             — Cross-domain components (ProtectedRoute) + shared pages
  router/             — Route tree with role-based guards
  test/               — Vitest setup and shared test utilities
```

## Rules
- Never use Redux. Zustand + persist middleware only.
- Never call `fetch()` directly in components. Route through `services/`.
- Never inline `new EventSource(...)`. All SSE connections live in `sseService.ts`.
- All public service functions must have explicit TypeScript return types.
- Keep files under 500 lines.
- Never hardcode backend URLs — use `import.meta.env.VITE_API_BASE_URL`.
- Follow root `CLAUDE.md` for swarm config, concurrency, and security rules.
- Run `npm run lint` and `npm test` before committing.
