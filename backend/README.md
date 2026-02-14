# Smart Appointment Booking API

Production-grade appointment scheduling backend with AI agent support. Providers define availability, customers book time slots, and an AI scheduling agent helps both sides manage calendars via natural language.

## Tech Stack

- **Runtime**: TypeScript (strict), NestJS 11, Node.js 22
- **Database**: PostgreSQL 16 with GiST exclusion constraint for overlap prevention
- **Cache**: Redis 7 for ephemeral slot holds (5-minute TTL)
- **Auth**: Passport JWT with role-based access control (CUSTOMER / PROVIDER)
- **AI**: OpenRouter API (Gemini free model) via OpenAI SDK, agentic tool-use loop
- **Dates**: Luxon for timezone-aware interval math
- **Validation**: class-validator DTOs + Zod schemas for AI tool inputs
- **ORM**: Prisma 7 with `@prisma/adapter-pg` driver adapter

## Architecture

```
src/
├── auth/           # JWT register/login, Passport strategy
├── provider/       # Provider CRUD (profession, timezone, buffer)
├── availability/   # Recurring rules, overrides, slot calculator
├── booking/        # Hold → Confirm → Cancel/Reschedule flow
├── scheduling-agent/ # AI agent with role-based tools
├── common/         # Guards, filters, interceptors, decorators
├── prisma/         # PrismaService (global)
├── redis/          # RedisService with hold management (global)
└── config/         # Typed configuration
cli/                # Interactive CLI client (tsx)
```

## Key Design Decisions

- **Redis-only holds**: No HELD status in Postgres. Holds are ephemeral with 5-min TTL. Multiple customers can hold the same slot — the PG exclusion constraint arbitrates at confirm time.
- **Three-layer overlap protection**: (1) App-level buffer check at hold/confirm/reschedule, (2) PG advisory lock serializes concurrent confirms per provider, (3) GiST exclusion constraint is the final DB-level guarantee.
- **Idempotency**: `Booking.idempotencyKey` unique column for confirms (INSERT). `IdempotencyRecord` table for cancel/reschedule (UPDATEs). Required `Idempotency-Key` header on mutating endpoints.
- **Role-based AI tools**: Customer tools (find slots, hold, confirm, cancel). Provider tools (view/modify schedule with two-step preview/apply).

## Quick Start

### Prerequisites

- Node.js 22+, npm
- Docker & Docker Compose

### Setup

```bash
cd backend

# Start PostgreSQL + Redis
docker-compose up -d

# Install dependencies
npm install

# Run migrations + seed
npx prisma migrate dev
npx prisma db seed

# Start dev server
npm run start:dev
```

The API runs at `http://localhost:3000` with Swagger docs at `http://localhost:3000/api/docs`.

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | (see .env) | PostgreSQL connection string |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6380 | Redis port |
| `JWT_SECRET` | change-me | JWT signing secret |
| `JWT_EXPIRES_IN` | 1h | JWT expiry |
| `OPENROUTER_API_KEY` | - | OpenRouter API key (for AI agent) |
| `OPENROUTER_MODEL` | google/gemini-2.0-flash-exp:free | LLM model |
| `PORT` | 3000 | Server port |

## Demo Flow

### 1. Register a provider

```bash
curl -X POST http://localhost:3000/auth/register \
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
curl -X POST http://localhost:3000/availability/recurring \
  -H "Authorization: Bearer <provider_token>" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}'
```

### 3. Register a customer

```bash
curl -X POST http://localhost:3000/auth/register \
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
curl "http://localhost:3000/availability/slots/<providerId>?startDate=2026-02-16&endDate=2026-02-20&durationMinutes=30" \
  -H "Authorization: Bearer <customer_token>"
```

### 5. Hold a slot

```bash
curl -X POST http://localhost:3000/bookings/hold \
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
curl -X POST http://localhost:3000/bookings/confirm \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"holdId": "<holdId>"}'
```

### 7. Chat with AI agent

```bash
curl -X POST http://localhost:3000/agent/chat \
  -H "Authorization: Bearer <customer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find me a 30-minute morning slot next week",
    "providerId": "<providerId>"
  }'
```

## CLI Client

```bash
npm run cli
```

Interactive menu-driven client with:
- Login/Register
- Browse providers, query slots, hold + confirm bookings
- Provider schedule management (recurring rules, overrides)
- AI assistant chat

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register user |
| POST | `/auth/login` | Public | Login, get JWT |
| GET | `/auth/me` | JWT | Current user profile |
| GET | `/providers` | JWT | List all providers |
| GET | `/providers/:id` | JWT | Provider details |
| GET | `/providers/me` | JWT+PROVIDER | Own provider profile |
| PATCH | `/providers/me` | JWT+PROVIDER | Update provider profile |
| POST | `/availability/recurring` | JWT+PROVIDER | Add recurring rule |
| GET | `/availability/recurring` | JWT+PROVIDER | List recurring rules |
| DELETE | `/availability/recurring/:id` | JWT+PROVIDER | Delete recurring rule |
| POST | `/availability/overrides` | JWT+PROVIDER | Add override |
| GET | `/availability/overrides` | JWT+PROVIDER | List overrides |
| DELETE | `/availability/overrides/:id` | JWT+PROVIDER | Delete override |
| GET | `/availability/slots/:providerId` | JWT | Query available slots |
| POST | `/bookings/hold` | JWT | Hold a slot (5min TTL) |
| POST | `/bookings/confirm` | JWT + Idempotency-Key | Confirm booking |
| GET | `/bookings` | JWT | List own bookings |
| GET | `/bookings/:id` | JWT | Booking details |
| PATCH | `/bookings/:id/cancel` | JWT + Idempotency-Key | Cancel booking |
| PATCH | `/bookings/:id/reschedule` | JWT + Idempotency-Key | Reschedule |
| POST | `/agent/chat` | JWT | AI scheduling assistant |

## Testing

```bash
# Unit tests (29 tests)
npm test

# E2E tests (requires running PostgreSQL + Redis)
npm run test:e2e
```

## Docker

```bash
docker build -t smart-booking .
docker run -p 3000:3000 --env-file .env smart-booking
```
