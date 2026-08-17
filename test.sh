#!/bin/bash
# ═══════════════════════════════════════════
# TenderMind — E2E smoke test (ishlab turgan server + MongoDB talab qiladi)
#
# Sof mantiq testlari uchun:  npm test
# Bu skript esa haqiqiy API zanjirini tekshiradi.
# ═══════════════════════════════════════════

PORT=$(grep -E '^PORT=' .env 2>/dev/null | tail -n1 | cut -d'=' -f2 | tr -d ' \r')
API="http://localhost:${PORT:-3002}"

# Har safar yangi raqam — "allaqachon ro'yxatdan o'tgan" xatosining oldini oladi
PHONE="+9989$(date +%H%M%S)00"
PASSWORD="test1234"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
  local name=$1 expected=$2 actual=$3
  printf "%-46s" "  $name"
  if [ "$actual" = "$expected" ]; then
    printf "${GREEN}✅ PASS${NC} (%s)\n" "$actual"; PASS=$((PASS+1))
  else
    printf "${RED}❌ FAIL${NC} (kutilgan %s, olingan %s)\n" "$expected" "$actual"; FAIL=$((FAIL+1))
  fi
}

code() {  # code METHOD PATH [DATA] [TOKEN]
  local method=$1 path=$2 data=$3 token=$4
  local args=(-s -o /dev/null -w "%{http_code}" -X "$method" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}" "$API$path"
}

echo ""
echo "🧪 TenderMind E2E — $API"
echo "=================================================="

echo -e "${YELLOW}1. Salomatlik va ochiq endpointlar${NC}"
check "GET /api/health"          200 "$(code GET /api/health)"
check "GET /api/tenders"         200 "$(code GET /api/tenders)"
check "GET / (landing)"          200 "$(code GET /)"
check "GET /api/yoq (404)"       404 "$(code GET /api/yoq)"

echo ""
echo -e "${YELLOW}2. Himoya: tokensiz kirish rad etilishi kerak${NC}"
check "POST /api/chat"           401 "$(code POST /api/chat '{"message":"salom"}')"
check "POST /api/generate"       401 "$(code POST /api/generate '{"company":"X"}')"
check "POST /api/export/pdf"     401 "$(code POST /api/export/pdf '{"content":"x"}')"
check "GET /api/saved"           401 "$(code GET /api/saved)"

echo ""
echo -e "${YELLOW}3. Ro'yxatdan o'tish va kirish${NC}"
REG="{\"name\":\"Test User\",\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\",\"company\":\"Test LLC\"}"
check "POST /api/auth/register"  201 "$(code POST /api/auth/register "$REG")"

TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"$PASSWORD\"}" \
  "$API/api/auth/login" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "  ${RED}❌ Login muvaffaqiyatsiz — token olinmadi${NC}"; FAIL=$((FAIL+1))
else
  echo -e "  ${GREEN}✅ Login OK — token olindi${NC}"; PASS=$((PASS+1))
fi

echo ""
echo -e "${YELLOW}4. Token bilan amallar${NC}"
if [ -n "$TOKEN" ]; then
  check "GET /api/auth/me"       200 "$(code GET /api/auth/me '' "$TOKEN")"
  check "POST /api/saved/it-001" 200 "$(code POST /api/saved/it-001 '' "$TOKEN")"
  check "GET /api/saved"         200 "$(code GET /api/saved '' "$TOKEN")"
  check "POST /api/won/it-001"   200 "$(code POST /api/won/it-001 '' "$TOKEN")"
  check "GET /api/won"           200 "$(code GET /api/won '' "$TOKEN")"
  check "POST /api/export/pdf"   200 "$(code POST /api/export/pdf '{"content":"Test hujjat"}' "$TOKEN")"
else
  echo -e "  ${RED}Token yo'q — bu bo'lim o'tkazib yuborildi${NC}"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✅ O'tdi: $PASS${NC}   ${RED}❌ Yiqildi: $FAIL${NC}"
[ $FAIL -eq 0 ] && echo -e "${GREEN}🎉 Barcha testlar muvaffaqiyatli${NC}" || echo -e "${RED}⚠️  Ba'zi testlar yiqildi${NC}"
echo ""
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
