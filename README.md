# Smart Appointment Booking

A production-grade appointment scheduling platform with AI-powered scheduling assistance. Providers define their availability, customers book time slots through a sophisticated hold-then-confirm workflow, and an AI agent helps both sides manage calendars via natural language.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Booking Lifecycle](#booking-lifecycle)
- [Concurrency & Safety](#concurrency--safety)
- [AI Scheduling Agent](#ai-scheduling-agent)
- [API Endpoints](#api-endpoints)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Demo Flow](#demo-flow)
- [CLI Client](#cli-client)
- [Testing](#testing)
- [Docker](#docker)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22, TypeScript (strict mode, no `any`) |
| **Framework** | NestJS 11 (modules, DI, guards, pipes, interceptors) |
| **Database** | PostgreSQL 16 with GiST exclusion constraint |
| **Cache / Locks** | Redis 7 (ioredis) for ephemeral holds + conversation history |
| **ORM** | Prisma 7 with `@prisma/adapter-pg` driver adapter |
| **Auth** | Passport JWT with role-based access control (CUSTOMER / PROVIDER) |
| **AI** | OpenRouter API (Gemini free model) via OpenAI SDK, agentic tool-use loop |
| **Dates** | Luxon for timezone-aware interval arithmetic |
| **Validation** | class-validator DTOs + Zod schemas for AI tool inputs |
| **Logging** | nestjs-pino with per-request correlation IDs |
| **API Docs** | Swagger / OpenAPI at `/api/docs` |
| **Testing** | Jest + Supertest (unit + E2E) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         NestJS Application                       │
│                                                                  │
│  ┌────────────┐  ┌────────────────┐  ┌──────────────────────┐   │
│  │   Auth      │  │   Provider     │  │   Availability       │   │
│  │  Module     │  │   Module       │  │   Module             │   │
│  │            │  │               │  │                      │   │
│  │ register() │  │ findAll()     │  │ recurring CRUD       │   │
│  │ login()    │  │ findById()    │  │ override CRUD        │   │
│  │ getMe()    │  │ update()      │  │ slot calculator      │   │
│  └────────────┘  └────────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐  │
│  │   Booking Module        │  │   Scheduling Agent Module    │  │
│  │                         │  │                              │  │
│  │ holdSlot()    ──Redis──>│  │ chat() ──LLM──> tool calls   │  │
│  │ confirmBooking() ─PG──>│  │ clearHistory()               │  │
│  │ cancelBooking()        │  │                              │  │
│  │ rescheduleBooking()    │  │ Tools: find_slots, hold,     │  │
│  │ listBookings()         │  │   confirm, cancel, reschedule│  │
│  └─────────────────────────┘  └──────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Common Layer                             ││
│  │  Guards: JWT, Roles  │  Filters: AllExceptions              ││
│  │  Interceptors: Transform, Logging  │  Middleware: RequestId ││
│  │  Decorators: @CurrentUser, @Public, @Roles, @IdempotencyKey ││
│  └─────────────────────────────────────────────────────────────┘│
└────────────────────┬──────────────────────┬─────────────────────┘
                     │                      │
              ┌──────▼──────┐        ┌──────▼──────┐
              │ PostgreSQL  │        │   Redis     │
              │             │        │             │
              │ Users       │        │ Holds (5m)  │
              │ Providers   │        │ Conv (30m)  │
              │ Bookings    │        │             │
              │ Availability│        │             │
              └─────────────┘        └─────────────┘
```

### Module Responsibilities

- **Auth** - JWT registration/login, Passport strategy, role assignment
- **Provider** - Provider profile CRUD (profession, timezone, buffer between appointments)
- **Availability** - Recurring weekly rules, one-off overrides (BLOCK/OPEN), intelligent slot calculator with scoring
- **Booking** - The core: hold-then-confirm workflow with triple-layer concurrency protection
- **Scheduling Agent** - AI assistant that wraps all of the above behind natural language, with role-gated tools
- **Common** - Cross-cutting: auth guards, response envelope, error formatting, request IDs, logging

---

## Database Schema

```
┌──────────┐       ┌───────────┐       ┌──────────────────────┐
│  User    │1────1?│ Provider  │1────N │ RecurringAvailability │
│          │       │           │       └──────────────────────┘
│ id       │       │ id        │
│ email    │       │ profession│       ┌──────────────────────┐
│ password │       │ timezone  │1────N │ AvailabilityOverride  │
│ name     │       │ buffer    │       │ (BLOCK / OPEN)        │
│ role     │       │           │       └──────────────────────┘
└──────────┘       └───────────┘
     │1                  │1
     │                   │
     │N                  │N
┌──────────────────────────────┐     ┌────────────────────┐
│           Booking            │     │ IdempotencyRecord   │
│                              │     │                    │
│ id, providerId, customerId   │     │ key (PK)           │
│ startTime, endTime           │     │ bookingId          │
│ status (CONFIRMED/CANCELLED) │     │ operation          │
│ idempotencyKey (unique)      │     │ response (JSON)    │
│                              │     │                    │
│ EXCLUDE USING gist (         │     └────────────────────┘
│   providerId WITH =,         │
│   tstzrange WITH &&          │
│ ) WHERE status='CONFIRMED'   │
└──────────────────────────────┘
```

**Key constraint**: The PostgreSQL GiST exclusion constraint on `Booking` makes it physically impossible for two CONFIRMED bookings to overlap for the same provider. This is the final safety net beyond application-level checks.

---

## Booking Lifecycle

```
Customer finds slot
        │
        ▼
   ┌─────────┐     Redis SET with 5-min TTL
   │  HOLD   │────────────────────────────────► Redis: booking:hold:{id}
   └─────────┘
        │
        │  Within 5 minutes
        ▼
   ┌──────────┐    PG transaction + advisory lock
   │ CONFIRM  │────────────────────────────────► Booking row (CONFIRMED)
   └──────────┘    Redis hold deleted
        │
        ├──── Cancel ────► status → CANCELLED
        │
        └──── Reschedule ────► Old → CANCELLED, New → CONFIRMED (atomic)
```

### Why Hold-Then-Confirm?

1. **Non-blocking**: Multiple customers can hold the same slot simultaneously. Only Redis is touched, no DB rows created.
2. **Auto-expiry**: Holds vanish after 5 minutes if not confirmed. No cleanup jobs needed.
3. **DB arbitrates**: At confirm time, PostgreSQL's exclusion constraint is the single source of truth. First to confirm wins.

---

## Concurrency & Safety

The booking system uses **three layers** of protection against double-bookings:

### Layer 1: Application Buffer Check
Before creating a hold or confirming, the app queries for existing CONFIRMED bookings that overlap the requested time window (including the provider's buffer minutes on each side). This catches most conflicts instantly.

### Layer 2: PostgreSQL Advisory Lock
At confirm time, a transaction-scoped advisory lock is acquired on the provider's ID:
```sql
SELECT pg_advisory_xact_lock(hash_of(providerId))
```
This **serializes** all concurrent confirms for the same provider. Even if two customers hold the same slot, their confirms execute one at a time.

### Layer 3: GiST Exclusion Constraint
The database-level exclusion constraint is the final guarantee:
```sql
EXCLUDE USING gist (
  "providerId" WITH =,
  tstzrange("startTime", "endTime", '[)') WITH &&
) WHERE (status = 'CONFIRMED')
```
If layers 1 and 2 somehow both pass, the DB itself rejects the overlapping INSERT. This can never be bypassed.

### Idempotency

All mutating booking operations require an `Idempotency-Key` header:

- **Confirm**: Uses `Booking.idempotencyKey` unique column. Duplicate INSERTs return the existing booking.
- **Cancel / Reschedule**: Uses the `IdempotencyRecord` table. The cached JSON response is returned for replays.

This means network retries and duplicate requests are always safe.

---

## AI Scheduling Agent

The `/agent/chat` endpoint provides a conversational AI assistant powered by an agentic tool-use loop.

### How It Works

```
User message
     │
     ▼
┌─────────────────┐
│ Load history     │◄──── Redis (last 20 messages, 30-min TTL)
│ from Redis       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Call LLM with   │     Tools are role-gated:
│ system prompt + │     - Customer: 8 tools (find, hold, confirm, cancel, reschedule...)
│ history + tools │     - Provider: 6 tools (view schedule, preview/apply changes...)
└────────┬────────┘
         │
    ┌────┴────┐
    │ Tool    │──Yes──► Execute tool ──► Feed result back to LLM ──┐
    │ calls?  │                                                     │
    └────┬────┘◄────────────────────────────────────────────────────┘
         │                          (max 10 iterations)
        No
         │
         ▼
   Return text response
   Save history to Redis
```

### Customer Tools
| Tool | Description |
|------|-------------|
| `list_providers` | Browse all providers |
| `find_available_slots` | Search slots with preferences (time of day, preferred days) |
| `get_provider_availability` | View provider schedule and profile |
| `hold_slot` | Create 5-minute temporary hold |
| `confirm_booking` | Confirm a held slot |
| `get_my_bookings` | List own bookings with filters |
| `cancel_booking` | Cancel with reason |
| `reschedule_booking` | Move booking to a new time |

### Provider Tools
| Tool | Description |
|------|-------------|
| `get_my_availability` | View recurring rules, overrides, bookings |
| `get_my_bookings` | View upcoming appointments |
| `preview_schedule_change` | Dry-run a BLOCK/OPEN change (shows affected bookings) |
| `apply_schedule_change` | Apply a previewed change |
| `block_time_range` | Block a time range |
| `add_availability` | Add recurring rule or one-time window |

### Slot Scoring Algorithm

When searching for slots, the calculator scores each candidate (0-100 points):

| Factor | Points | Logic |
|--------|--------|-------|
| Time-of-day match | 30 | Morning (9-12), Afternoon (12-5), Evening (5-8) |
| Preferred day match | 25 | Matches requested days of week |
| Earliness | 20 | Sooner slots rank higher (decays by 1pt/day) |
| Constraint compliance | 15 | Respects notBefore / notAfter boundaries |

---

## API Endpoints

All responses are wrapped in a standard envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "uuid", "timestamp": "ISO-8601" }
}
```

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register (CUSTOMER or PROVIDER) |
| POST | `/auth/login` | Public | Login, receive JWT |
| GET | `/auth/me` | JWT | Current user profile |

### Providers
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/providers` | JWT | List all providers |
| GET | `/providers/:id` | JWT | Provider details |
| GET | `/providers/me` | PROVIDER | Own profile |
| PATCH | `/providers/me` | PROVIDER | Update profile |

### Availability
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/availability/recurring` | PROVIDER | Add recurring rule |
| GET | `/availability/recurring` | PROVIDER | List recurring rules |
| DELETE | `/availability/recurring/:id` | PROVIDER | Delete rule |
| POST | `/availability/overrides` | PROVIDER | Add override (BLOCK/OPEN) |
| GET | `/availability/overrides` | PROVIDER | List overrides |
| DELETE | `/availability/overrides/:id` | PROVIDER | Delete override |
| GET | `/availability/slots/:providerId` | JWT | Query available slots |

### Bookings
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/bookings/hold` | JWT | Hold a slot (5-min TTL) |
| POST | `/bookings/confirm` | JWT + `Idempotency-Key` | Confirm booking |
| GET | `/bookings` | JWT | List own bookings (paginated) |
| GET | `/bookings/:id` | JWT | Booking details |
| PATCH | `/bookings/:id/cancel` | JWT + `Idempotency-Key` | Cancel booking |
| PATCH | `/bookings/:id/reschedule` | JWT + `Idempotency-Key` | Reschedule |

### AI Agent
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/agent/chat` | JWT | Chat with AI assistant |
| DELETE | `/agent/history` | JWT | Clear conversation history |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | DB + Redis connectivity check |

---

## Quick Start

### Prerequisites

- Node.js 22+
- Docker & Docker Compose

### Setup

```bash
cd backend

# Start PostgreSQL + Redis
docker-compose up -d

# Install dependencies
npm install

# Copy env and configure (add your OPENROUTER_API_KEY for AI features)
cp .env.example .env

# Run migrations + seed
npx prisma migrate dev
npx prisma db seed

# Start dev server
npm run start:dev
```

The API runs at `http://localhost:3000` with Swagger docs at `http://localhost:3000/api/docs`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(see .env.example)* | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6380` | Redis port (mapped from Docker) |
| `JWT_SECRET` | `change-me` | JWT signing secret |
| `JWT_EXPIRES_IN` | `1h` | JWT token expiry |
| `OPENROUTER_API_KEY` | - | OpenRouter API key (required for AI agent) |
| `OPENROUTER_MODEL` | `google/gemini-2.0-flash-exp:free` | LLM model identifier |
| `PORT` | `3000` | Server listen port |
| `LOG_LEVEL` | `info` | Logging level |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |

---

## Demo Flow

### 1. Register a provider

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dr.smith@example.com",
    "password": "SecurePass123!",
    "name": "Dr. Smith",
    "role": "PROVIDER",
    "profession": "Dentist",
    "timezone": "America/New_York"
  }'
```

### 2. Set recurring availability (as provider)

```bash
curl -s -X POST http://localhost:3000/availability/recurring \
  -H "Authorization: Bearer <provider_token>" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}'
```

### 3. Register a customer

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "SecurePass123!",
    "name": "Jane Customer",
    "role": "CUSTOMER"
  }'
```

### 4. Query available slots

```bash
curl -s "http://localhost:3000/availability/slots/<providerId>?startDate=2026-02-16&endDate=2026-02-20&durationMinutes=30" \
  -H "Authorization: Bearer <customer_token>"
```

### 5. Hold a slot

```bash
curl -s -X POST http://localhost:3000/bookings/hold \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<providerId>",
    "startTime": "2026-02-17T10:00:00Z",
    "durationMinutes": 30,
    "notes": "Regular checkup"
  }'
```

### 6. Confirm booking (within 5 minutes)

```bash
curl -s -X POST http://localhost:3000/bookings/confirm \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"holdId": "<holdId>"}'
```

### 7. Chat with AI agent

```bash
curl -s -X POST http://localhost:3000/agent/chat \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find me a 30-minute morning slot next week",
    "providerId": "<providerId>"
  }'
```

---

## CLI Client

An interactive terminal client is included:

```bash
cd backend
npm run cli
```

Features:
- Login / Register
- Browse providers and query available slots
- Hold + confirm bookings
- Provider schedule management (recurring rules, overrides)
- AI assistant chat

---

## Testing

```bash
cd backend

# Unit tests
npm test

# E2E tests (requires running PostgreSQL + Redis)
npm run test:e2e

# Coverage report
npm run test:cov
```

---

## Docker

### Development (PostgreSQL + Redis only)

```bash
cd backend
docker-compose up -d
```

This starts:
- **PostgreSQL 16** on port `5434` (with `btree_gist` extension auto-installed)
- **Redis 7** on port `6380` (append-only persistence)

### Production Build

```bash
cd backend
docker build -t smart-booking .
docker run -p 3000:3000 --env-file .env smart-booking
```

---

## Project Structure

```
Smart Appointment Booking/
├── backend/
│   ├── src/
│   │   ├── auth/                  # JWT register/login, Passport strategy
│   │   ├── provider/              # Provider CRUD (profession, timezone, buffer)
│   │   ├── availability/          # Recurring rules, overrides, slot calculator
│   │   ├── booking/               # Hold → Confirm → Cancel/Reschedule flow
│   │   ├── scheduling-agent/      # AI agent with role-gated tools
│   │   │   └── tools/             # Tool definitions, schemas, executor
│   │   ├── health/                # DB + Redis health check
│   │   ├── common/                # Guards, filters, interceptors, decorators
│   │   ├── prisma/                # PrismaService (global)
│   │   ├── redis/                 # RedisService with hold + conversation mgmt
│   │   ├── config/                # Typed env configuration
│   │   ├── app.module.ts          # Root module wiring
│   │   └── main.ts                # Bootstrap + Swagger setup
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema (6 models, 3 enums)
│   │   ├── migrations/            # SQL migrations
│   │   └── seed.ts                # Seed data
│   ├── cli/                       # Interactive terminal client
│   ├── test/                      # E2E tests
│   ├── docker-compose.yml         # PostgreSQL + Redis services
│   ├── Dockerfile                 # Multi-stage production build
│   └── package.json
└── claude/                        # Design docs (architecture, API contract, data model)
```
