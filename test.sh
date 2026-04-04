#!/bin/bash
# ═══════════════════════════════════════════
# TenderMind MVP — Test Suite
# API & Feature Testing
# ═══════════════════════════════════════════

API="http://localhost:3000"
PHONE="+998901234567"
PASSWORD="test1234"
COMPANY="Test Company LLC"

echo "🧪 TenderMind MVP v2.1 Test Suite"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counter
PASS=0
FAIL=0

test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_code=${5:-200}

  echo -n "🔄 Testing: $name ... "
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method \
      -H "Content-Type: application/json" \
      "$API$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X $method \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API$endpoint")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code)"
    ((PASS++))
  else
    echo -e "${RED}❌ FAIL${NC} (Expected $expected_code, got $http_code)"
    echo "   Response: $(echo $body | cut -c1-80)..."
    ((FAIL++))
  fi
}

# ── Test 1: Health Check ────────────────────────────────────────────
echo "${YELLOW}📋 1. Health Checks${NC}"
test_endpoint "Server running" "GET" "/" 200

# ── Test 2: Tender Operations ───────────────────────────────────────
echo ""
echo "${YELLOW}📋 2. Tender Operations${NC}"
test_endpoint "List all tenders" "GET" "/api/tenders" 200
test_endpoint "Get specific tender" "GET" "/api/tenders/it-001" 200
test_endpoint "Search tenders" "GET" "/api/tenders?search=IT" 200

# ── Test 3: Authentication ─────────────────────────────────────────
echo ""
echo "${YELLOW}📋 3. Authentication${NC}"

# Register
phone_data="{\"name\":\"Test User\",\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\",\"company\":\"$COMPANY\"}"
test_endpoint "Register user" "POST" "/api/auth/register" "$phone_data" 201

# Login
login_data="{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}"
response=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "$login_data" "$API/api/auth/login")
TOKEN=$(echo $response | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed - couldn't extract token${NC}"
  ((FAIL++))
else
  echo -e "${GREEN}✅ Login successful - token extracted${NC}"
  ((PASS++))
fi

# ── Test 4: User Operations ────────────────────────────────────────
echo ""
echo "${YELLOW}📋 4. User Operations (Authenticated)${NC}"

if [ ! -z "$TOKEN" ]; then
  # Save tender
  save_data="{\"id\":\"it-001\"}"
  test_endpoint "Save tender" "POST" "/api/saved/it-001" "$save_data" 200
  
  # Get saved tenders
  test_endpoint "Get saved tenders" "GET" "/api/saved" 200
  
  # Mark tender as won
  won_data="{\"id\":\"it-001\"}"
  test_endpoint "Mark as won" "POST" "/api/won/it-001" "$won_data" 200
  
  # Get won tenders
  test_endpoint "Get won tenders" "GET" "/api/won" 200
else
  echo -e "${RED}❌ Skipping authenticated tests - no token${NC}"
fi

# ── Test 5: Error Handling ───────────────────────────────────────
echo ""
echo "${YELLOW}📋 5. Error Handling${NC}"
test_endpoint "404 - Not found" "GET" "/api/invalid-endpoint" 404
test_endpoint "Invalid tender ID" "GET" "/api/tenders/invalid-id" 200

# ── Test 6: Rate Limiting ─────────────────────────────────────────
echo ""
echo "${YELLOW}📋 6. Rate Limiting${NC}"
echo "🔄 Testing API rate limits (may take 30 seconds)..."
# Make multiple high-speed requests
for i in {1..65}; do
  curl -s "$API/api/tenders" > /dev/null &
done
wait
test_endpoint "Rate limit check" "GET" "/api/tenders" 429

# ── Summary ────────────────────────────────────────────────────────
echo ""
echo "=================================="
echo -e "${GREEN}✅ Passed: $PASS${NC}"
echo -e "${RED}❌ Failed: $FAIL${NC}"

total=$((PASS + FAIL))
percentage=$((PASS * 100 / total))

echo -e "Success Rate: ${GREEN}$percentage%${NC} ($PASS/$total)"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed${NC}"
  exit 1
fi
