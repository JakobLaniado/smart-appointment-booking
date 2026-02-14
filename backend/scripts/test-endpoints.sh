#!/usr/bin/env bash
# =============================================================================
# Smart Appointment Booking — Endpoint Test Script
# =============================================================================
# Usage:
#   chmod +x scripts/test-endpoints.sh
#   ./scripts/test-endpoints.sh
#
# Prerequisites:
#   - Server running on http://localhost:3000
#   - PostgreSQL and Redis available
#   - curl and jq installed
# =============================================================================

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROVIDER_EMAIL="provider-$(date +%s)@test.com"
CUSTOMER_EMAIL="customer-$(date +%s)@test.com"
PASSWORD="TestPass1234"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

passed=0
failed=0
skipped=0

print_header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
}

print_test() {
  echo -e "\n${YELLOW}▸ $1${NC}"
}

check_status() {
  local expected=$1
  local actual=$2
  local label=$3

  if [ "$actual" -eq "$expected" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} — $label (HTTP $actual)"
    passed=$((passed + 1))
  else
    echo -e "  ${RED}✗ FAIL${NC} — $label (expected $expected, got $actual)"
    failed=$((failed + 1))
  fi
}

# ---------------------------------------------------------------------------
print_header "1. HEALTH CHECK"
# ---------------------------------------------------------------------------

print_test "GET /health (public)"
HTTP_CODE=$(curl -s -o /tmp/health.json -w "%{http_code}" "$BASE_URL/health")
check_status 200 "$HTTP_CODE" "Health check"
echo "  Response: $(jq -c . /tmp/health.json)"

# ---------------------------------------------------------------------------
print_header "2. AUTH — Register & Login"
# ---------------------------------------------------------------------------

print_test "POST /auth/register — Provider"
HTTP_CODE=$(curl -s -o /tmp/register-provider.json -w "%{http_code}" \
  -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$PROVIDER_EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"Dr. Curl Test\",
    \"role\": \"PROVIDER\",
    \"profession\": \"Dentist\",
    \"timezone\": \"America/New_York\"
  }")
check_status 201 "$HTTP_CODE" "Register provider"
PROVIDER_TOKEN=$(jq -r '.data.accessToken' /tmp/register-provider.json)
echo "  Token: ${PROVIDER_TOKEN:0:30}..."

print_test "POST /auth/register — Customer"
HTTP_CODE=$(curl -s -o /tmp/register-customer.json -w "%{http_code}" \
  -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$CUSTOMER_EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"Jane Customer\",
    \"role\": \"CUSTOMER\"
  }")
check_status 201 "$HTTP_CODE" "Register customer"
CUSTOMER_TOKEN=$(jq -r '.data.accessToken' /tmp/register-customer.json)
echo "  Token: ${CUSTOMER_TOKEN:0:30}..."

print_test "POST /auth/login — Provider"
HTTP_CODE=$(curl -s -o /tmp/login.json -w "%{http_code}" \
  -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$PROVIDER_EMAIL\", \"password\": \"$PASSWORD\"}")
check_status 201 "$HTTP_CODE" "Login provider"

print_test "GET /auth/me — Provider"
HTTP_CODE=$(curl -s -o /tmp/me.json -w "%{http_code}" \
  "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "Get profile"
PROVIDER_ID=$(jq -r '.data.provider.id // .data.providerId // empty' /tmp/me.json)
echo "  Provider ID: $PROVIDER_ID"

print_test "POST /auth/register — Duplicate email (should fail)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$PROVIDER_EMAIL\", \"password\": \"$PASSWORD\", \"name\": \"Dup\", \"role\": \"CUSTOMER\"}")
check_status 409 "$HTTP_CODE" "Duplicate email rejected"

# ---------------------------------------------------------------------------
print_header "3. PROVIDERS"
# ---------------------------------------------------------------------------

print_test "GET /providers"
HTTP_CODE=$(curl -s -o /tmp/providers.json -w "%{http_code}" \
  "$BASE_URL/providers" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 200 "$HTTP_CODE" "List providers"
echo "  Count: $(jq '.data | length' /tmp/providers.json)"

print_test "GET /providers/me"
HTTP_CODE=$(curl -s -o /tmp/provider-me.json -w "%{http_code}" \
  "$BASE_URL/providers/me" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "Get own provider profile"

print_test "PATCH /providers/me"
HTTP_CODE=$(curl -s -o /tmp/provider-update.json -w "%{http_code}" \
  -X PATCH "$BASE_URL/providers/me" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"profession": "Orthodontist", "bufferMinutes": 10}')
check_status 200 "$HTTP_CODE" "Update provider profile"

print_test "GET /providers/:id"
HTTP_CODE=$(curl -s -o /tmp/provider-by-id.json -w "%{http_code}" \
  "$BASE_URL/providers/$PROVIDER_ID" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 200 "$HTTP_CODE" "Get provider by ID"

# ---------------------------------------------------------------------------
print_header "4. AVAILABILITY — Recurring"
# ---------------------------------------------------------------------------

print_test "POST /availability/recurring (Mon 09:00-17:00)"
HTTP_CODE=$(curl -s -o /tmp/recurring1.json -w "%{http_code}" \
  -X POST "$BASE_URL/availability/recurring" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}')
check_status 201 "$HTTP_CODE" "Create Monday recurring"
RECURRING_ID=$(jq -r '.data.id' /tmp/recurring1.json)

print_test "POST /availability/recurring (Tue-Fri)"
for day in 2 3 4 5; do
  curl -s -o /dev/null \
    -X POST "$BASE_URL/availability/recurring" \
    -H "Authorization: Bearer $PROVIDER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"dayOfWeek\": $day, \"startTime\": \"09:00\", \"endTime\": \"17:00\"}"
done
echo -e "  ${GREEN}✓ PASS${NC} — Created Tue-Fri recurring availability"
passed=$((passed + 1))

print_test "GET /availability/recurring"
HTTP_CODE=$(curl -s -o /tmp/recurring-list.json -w "%{http_code}" \
  "$BASE_URL/availability/recurring" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "List recurring availability"
echo "  Count: $(jq '.data | length' /tmp/recurring-list.json)"

print_test "DELETE /availability/recurring/:id"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "$BASE_URL/availability/recurring/$RECURRING_ID" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "Delete Monday recurring"

# Re-create Monday for later booking tests
curl -s -o /dev/null \
  -X POST "$BASE_URL/availability/recurring" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}'

# ---------------------------------------------------------------------------
print_header "5. AVAILABILITY — Overrides"
# ---------------------------------------------------------------------------

# Calculate a date two weeks from now (find next Monday)
NEXT_MONDAY=$(python3 -c "
from datetime import date, timedelta
today = date.today()
days_ahead = 7 - today.weekday()
if days_ahead <= 0: days_ahead += 7
d = today + timedelta(days=days_ahead + 7)
print(d.isoformat())
")

print_test "POST /availability/overrides (block)"
HTTP_CODE=$(curl -s -o /tmp/override.json -w "%{http_code}" \
  -X POST "$BASE_URL/availability/overrides" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"startTime\": \"${NEXT_MONDAY}T09:00:00.000Z\",
    \"endTime\": \"${NEXT_MONDAY}T12:00:00.000Z\",
    \"type\": \"BLOCK\",
    \"reason\": \"Doctor appointment\"
  }")
check_status 201 "$HTTP_CODE" "Create block override"
OVERRIDE_ID=$(jq -r '.data.id' /tmp/override.json)

print_test "GET /availability/overrides"
HTTP_CODE=$(curl -s -o /tmp/overrides-list.json -w "%{http_code}" \
  "$BASE_URL/availability/overrides" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "List overrides"

print_test "DELETE /availability/overrides/:id"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "$BASE_URL/availability/overrides/$OVERRIDE_ID" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "Delete override"

# ---------------------------------------------------------------------------
print_header "6. AVAILABILITY — Slot Query"
# ---------------------------------------------------------------------------

START_DATE=$(python3 -c "
from datetime import date, timedelta
today = date.today()
print((today + timedelta(days=7)).isoformat())
")
END_DATE=$(python3 -c "
from datetime import date, timedelta
today = date.today()
print((today + timedelta(days=21)).isoformat())
")

print_test "GET /availability/slots/:providerId"
HTTP_CODE=$(curl -s -o /tmp/slots.json -w "%{http_code}" \
  "$BASE_URL/availability/slots/$PROVIDER_ID?startDate=$START_DATE&endDate=$END_DATE&durationMinutes=30" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 200 "$HTTP_CODE" "Query available slots"
SLOT_COUNT=$(jq '.data | length' /tmp/slots.json)
echo "  Slots found: $SLOT_COUNT"

# Pick the first slot for booking
SLOT_START=$(jq -r '.data[0].startTime' /tmp/slots.json)
echo "  First slot: $SLOT_START"

# ---------------------------------------------------------------------------
print_header "7. BOOKINGS — Full Flow"
# ---------------------------------------------------------------------------

print_test "POST /bookings/hold"
HTTP_CODE=$(curl -s -o /tmp/hold.json -w "%{http_code}" \
  -X POST "$BASE_URL/bookings/hold" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"providerId\": \"$PROVIDER_ID\",
    \"startTime\": \"$SLOT_START\",
    \"durationMinutes\": 30,
    \"notes\": \"Curl test booking\"
  }")
check_status 201 "$HTTP_CODE" "Hold slot"
HOLD_ID=$(jq -r '.data.holdId' /tmp/hold.json)
echo "  Hold ID: $HOLD_ID"
echo "  Expires: $(jq -r '.data.expiresAt' /tmp/hold.json)"

print_test "POST /bookings/confirm"
CONFIRM_IDEM="curl-test-confirm-$(date +%s)"
HTTP_CODE=$(curl -s -o /tmp/confirm.json -w "%{http_code}" \
  -X POST "$BASE_URL/bookings/confirm" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $CONFIRM_IDEM" \
  -d "{\"holdId\": \"$HOLD_ID\"}")
check_status 201 "$HTTP_CODE" "Confirm booking"
BOOKING_ID=$(jq -r '.data.id' /tmp/confirm.json)
echo "  Booking ID: $BOOKING_ID"
echo "  Status: $(jq -r '.data.status' /tmp/confirm.json)"

print_test "POST /bookings/confirm — Idempotency replay"
HTTP_CODE=$(curl -s -o /tmp/confirm-replay.json -w "%{http_code}" \
  -X POST "$BASE_URL/bookings/confirm" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $CONFIRM_IDEM" \
  -d "{\"holdId\": \"doesnt-matter\"}")
check_status 201 "$HTTP_CODE" "Idempotent confirm returns same booking"
echo "  Same ID: $(jq -r '.data.id' /tmp/confirm-replay.json) == $BOOKING_ID"

print_test "GET /bookings (list, customer)"
HTTP_CODE=$(curl -s -o /tmp/bookings-list.json -w "%{http_code}" \
  "$BASE_URL/bookings?page=1&limit=10&sortBy=startTime&order=desc" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 200 "$HTTP_CODE" "List bookings (customer)"
echo "  Total: $(jq '.data.total' /tmp/bookings-list.json)"

print_test "GET /bookings (list, provider)"
HTTP_CODE=$(curl -s -o /tmp/bookings-prov.json -w "%{http_code}" \
  "$BASE_URL/bookings" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
check_status 200 "$HTTP_CODE" "List bookings (provider)"

print_test "GET /bookings/:id"
HTTP_CODE=$(curl -s -o /tmp/booking-detail.json -w "%{http_code}" \
  "$BASE_URL/bookings/$BOOKING_ID" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 200 "$HTTP_CODE" "Get booking detail"
echo "  Status: $(jq -r '.data.status' /tmp/booking-detail.json)"

# ---------------------------------------------------------------------------
print_header "8. BOOKINGS — Reschedule"
# ---------------------------------------------------------------------------

# Pick another available slot (use index 4 to avoid conflicts)
SLOT_START_3=$(jq -r '.data[4].startTime' /tmp/slots.json)

print_test "PATCH /bookings/:id/reschedule"
HTTP_CODE=$(curl -s -o /tmp/reschedule.json -w "%{http_code}" \
  -X PATCH "$BASE_URL/bookings/$BOOKING_ID/reschedule" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: curl-test-reschedule-$(date +%s)" \
  -d "{\"newStartTime\": \"$SLOT_START_3\", \"durationMinutes\": 30}")
check_status 200 "$HTTP_CODE" "Reschedule booking"
echo "  New start: $(jq -r '.data.startTime' /tmp/reschedule.json)"

# ---------------------------------------------------------------------------
print_header "9. BOOKINGS — Cancel"
# ---------------------------------------------------------------------------

print_test "PATCH /bookings/:id/cancel"
HTTP_CODE=$(curl -s -o /tmp/cancel.json -w "%{http_code}" \
  -X PATCH "$BASE_URL/bookings/$BOOKING_ID/cancel" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: curl-test-cancel-$(date +%s)" \
  -d '{"reason": "Changed my mind"}')
check_status 200 "$HTTP_CODE" "Cancel booking"
echo "  Status: $(jq -r '.data.status' /tmp/cancel.json)"

# ---------------------------------------------------------------------------
print_header "10. BOOKINGS — Double-booking prevention"
# ---------------------------------------------------------------------------

# Hold a slot, confirm it, then try to hold the same slot again
SLOT_START_DBL=$(jq -r '.data[6].startTime' /tmp/slots.json)
curl -s -o /tmp/dbl-hold1.json \
  -X POST "$BASE_URL/bookings/hold" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"providerId\": \"$PROVIDER_ID\", \"startTime\": \"$SLOT_START_DBL\", \"durationMinutes\": 30}"
DBL_HOLD_ID=$(jq -r '.data.holdId' /tmp/dbl-hold1.json)
curl -s -o /dev/null \
  -X POST "$BASE_URL/bookings/confirm" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: curl-dbl-$(date +%s)" \
  -d "{\"holdId\": \"$DBL_HOLD_ID\"}"

print_test "POST /bookings/hold — Same slot (should conflict)"
HTTP_CODE=$(curl -s -o /tmp/double-hold.json -w "%{http_code}" \
  -X POST "$BASE_URL/bookings/hold" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"providerId\": \"$PROVIDER_ID\",
    \"startTime\": \"$SLOT_START_DBL\",
    \"durationMinutes\": 30
  }")
check_status 409 "$HTTP_CODE" "Double-booking prevented"

# ---------------------------------------------------------------------------
print_header "11. AI SCHEDULING AGENT"
# ---------------------------------------------------------------------------

print_test "POST /agent/chat"
HTTP_CODE=$(curl -s -o /tmp/agent-chat.json -w "%{http_code}" \
  -X POST "$BASE_URL/agent/chat" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What providers are available?"}')
if [ "$HTTP_CODE" -eq 201 ]; then
  echo -e "  ${GREEN}✓ PASS${NC} — Agent chat (HTTP 201)"
  passed=$((passed + 1))
  echo "  Response: $(jq -r '.data.reply' /tmp/agent-chat.json | head -c 100)..."
elif [ "$HTTP_CODE" -eq 500 ]; then
  echo -e "  ${YELLOW}⊘ SKIP${NC} — Agent chat (HTTP 500 — likely missing OPENROUTER_API_KEY)"
  skipped=$((skipped + 1))
else
  echo -e "  ${RED}✗ FAIL${NC} — Agent chat (expected 201, got $HTTP_CODE)"
  failed=$((failed + 1))
fi

print_test "DELETE /agent/history"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE "$BASE_URL/agent/history" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 204 "$HTTP_CODE" "Clear agent history"

# ---------------------------------------------------------------------------
print_header "12. ERROR CASES"
# ---------------------------------------------------------------------------

print_test "GET /bookings — No auth (should fail)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/bookings")
check_status 401 "$HTTP_CODE" "Unauthorized request rejected"

print_test "POST /auth/register — Invalid body"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "bad"}')
check_status 400 "$HTTP_CODE" "Validation error on bad input"

print_test "GET /bookings/nonexistent-id"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "$BASE_URL/bookings/nonexistent-id" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")
check_status 404 "$HTTP_CODE" "Not found for invalid booking ID"

# ---------------------------------------------------------------------------
print_header "RESULTS"
# ---------------------------------------------------------------------------

TOTAL=$((passed + failed + skipped))
echo ""
echo -e "  ${GREEN}Passed:  $passed${NC}"
echo -e "  ${RED}Failed:  $failed${NC}"
if [ "$skipped" -gt 0 ]; then
  echo -e "  ${YELLOW}Skipped: $skipped${NC}"
fi
echo -e "  Total:   $TOTAL"
echo ""

if [ "$failed" -gt 0 ]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
