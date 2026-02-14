# Architecture

## Tech Stack

- **Runtime**: Node.js 18+, TypeScript (strict, no `any`)
- **Framework**: NestJS 10 (modules, services, controllers, guards, pipes, interceptors)
- **ORM**: Prisma 5 + PostgreSQL 16
- **Cache/Locks**: Redis 7 via ioredis
- **AI**: OpenRouter API (Gemini free) via `openai` npm package
- **Auth**: Passport JWT (local issuer, mocked OAuth)
- **Dates**: Luxon (timezone-aware)
- **Validation**: class-validator + class-transformer (endpoints), Zod (AI tool inputs)
- **Logging**: nestjs-pino with requestId correlation
- **CLI**: Commander + Inquirer + chalk + cli-table3

## Module Structure

```
src/
├── main.ts                        # Bootstrap, Swagger, CORS, pino logger
├── app.module.ts                  # Root module, global guards/filters/interceptors
├── config/configuration.ts        # Typed env config
├── common/                        # Shared utilities
│   ├── decorators/                # @CurrentUser, @Roles, @Public, @IdempotencyKey
│   ├── guards/                    # JwtAuthGuard (global), RolesGuard
│   ├── filters/                   # AllExceptionsFilter
│   └── interceptors/              # TransformInterceptor, LoggingInterceptor
├── prisma/                        # PrismaService + PrismaModule (global)
├── redis/                         # RedisService + RedisModule (global)
├── auth/                          # Register, login, JWT strategy
├── provider/                      # Provider CRUD
├── availability/                  # Recurring windows, overrides, slot calculator
├── booking/                       # Hold → confirm → cancel/reschedule
└── scheduling-agent/              # AI agent with tool calling
    └── tools/                     # Tool definitions + executor

cli/                               # Standalone CLI client
prisma/                            # Schema, migrations, seed
```

## Key Design Decisions

- **No HELD status in Postgres** — holds are Redis-only with TTL. Bookings go directly to CONFIRMED.
- **DB-level overlap guarantee** — GiST exclusion constraint on `(providerId, tstzrange(startTime, endTime, '[)'))` for CONFIRMED bookings.
- **Buffer is app-level** — exclusion constraint prevents raw overlaps; availability calculator + TOCTOU checks enforce buffer spacing.
- **Advisory lock per provider** — `pg_advisory_xact_lock` serializes concurrent confirms for the same provider.
- **Idempotency** — confirm uses `Booking.idempotencyKey` unique column; cancel/reschedule use `IdempotencyRecord` table.
- **AI tools are role-gated** — customers get read + book tools; providers get schedule mutation tools with two-step preview/apply.
- **Structured logging** — every request gets a `requestId`, attached to all log entries and error responses.
