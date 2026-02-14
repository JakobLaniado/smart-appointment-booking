# Execution Plan

## Branch Strategy

| Branch | Phase | Scope |
|--------|-------|-------|
| `feat/bootstrap` | 1 | NestJS scaffold, deps, docker, env, prisma schema + migration + seed |
| `feat/infra` | 2 | Prisma module, Redis module, config, common (guards/filters/interceptors/decorators), app.module + main.ts |
| `feat/auth` | 3 | Auth module: register, login, JWT strategy, guards |
| `feat/provider` | 4 | Provider CRUD |
| `feat/availability` | 5 | Recurring availability, overrides, availability calculator |
| `feat/booking` | 6 | Hold, confirm, cancel, reschedule with concurrency + idempotency |
| `feat/agent` | 7 | AI scheduling agent: OpenRouter, tools, role gating, audit |
| `feat/cli` | 8 | CLI client: Commander + Inquirer |
| `test/core` | 9 | Unit tests (calculator, agent, booking) + E2E tests |
| `feat/polish` | 10 | Swagger decorators, README with demo flow, Dockerfile |

## Rules

- Conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, `test(scope):`
- Every commit must pass `npm run build`
- Merge to `main` after each branch (no long-lived branches)
- Small, focused commits

## Verification

1. `docker-compose up -d` — PG + Redis healthy
2. `npx prisma migrate dev` — migrations + exclusion constraint
3. `npm run start:dev` — no errors
4. `http://localhost:3000/api/docs` — Swagger live
5. `npm run cli` — full booking flow via CLI
6. `npm test` — unit tests pass
7. `npm run test:e2e` — E2E pass including concurrency
8. 5 concurrent confirms → 1 wins, 4 get 409
