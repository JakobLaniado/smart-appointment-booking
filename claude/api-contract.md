# API Contract

## Response Envelope

**Success**:
```json
{ "success": true, "data": T, "meta": { "requestId": "...", "timestamp": "..." } }
```

**Paginated**:
```json
{ "success": true, "data": T[], "meta": { "requestId": "...", "timestamp": "...", "total": N, "page": N, "limit": N, "totalPages": N } }
```

**Error**:
```json
{ "success": false, "error": { "code": "SLOT_UNAVAILABLE", "message": "...", "details": {}, "requestId": "...", "timestamp": "..." } }
```

## Error Codes

| Code | HTTP | When |
|------|------|------|
| `SLOT_UNAVAILABLE` | 409 | Overlap or buffer conflict |
| `HOLD_EXPIRED` | 409 | Hold no longer exists in Redis |
| `MISSING_IDEMPOTENCY_KEY` | 400 | Header absent on confirm/cancel/reschedule |
| `FORBIDDEN` | 403 | Wrong role or not owner |
| `UNAUTHORIZED` | 401 | Missing/invalid JWT |
| `VALIDATION_FAILED` | 422 | Input validation error |
| `AI_PARSE_FAILED` | 422 | AI could not parse request |
| `NOT_FOUND` | 404 | Resource doesn't exist |

## Endpoints

### Auth
| Method | Path | Auth | Body/Query |
|--------|------|------|------------|
| POST | `/auth/register` | Public | `{ email, password, name, role, profession?, timezone? }` |
| POST | `/auth/login` | Public | `{ email, password }` |
| GET | `/auth/me` | JWT | — |

### Providers
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/providers` | JWT | List all |
| GET | `/providers/:id` | JWT | Detail |
| GET | `/providers/me` | PROVIDER | Own profile |
| PATCH | `/providers/me` | PROVIDER | `{ profession?, timezone?, bufferMinutes? }` |

### Availability
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/availability/recurring` | PROVIDER | `{ dayOfWeek, startTime, endTime }` |
| GET | `/availability/recurring` | PROVIDER | List own |
| DELETE | `/availability/recurring/:id` | PROVIDER | Remove |
| POST | `/availability/overrides` | PROVIDER | `{ startTime, endTime, type, reason? }` |
| GET | `/availability/overrides` | PROVIDER | List own (date range filter) |
| DELETE | `/availability/overrides/:id` | PROVIDER | Remove |
| GET | `/availability/slots/:providerId` | JWT | `?startDate&endDate&durationMinutes&timeOfDay?&preferredDays?&maxResults?` |

### Bookings
| Method | Path | Auth | Headers | Notes |
|--------|------|------|---------|-------|
| POST | `/bookings/hold` | CUSTOMER | — | `{ providerId, startTime, durationMinutes, notes? }` → `{ holdId, expiresAt }` |
| POST | `/bookings/confirm` | CUSTOMER | `Idempotency-Key` | `{ holdId }` → Booking |
| GET | `/bookings` | JWT | — | `?status&dateFrom&dateTo&page&limit` |
| GET | `/bookings/:id` | JWT | — | Owner only |
| PATCH | `/bookings/:id/cancel` | JWT | `Idempotency-Key` | `{ reason? }` |
| PATCH | `/bookings/:id/reschedule` | JWT | `Idempotency-Key` | `{ newStartTime, durationMinutes }` |

### AI Agent
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/agent/chat` | JWT | `{ message, providerId? }` → `{ response }` |
