#!/bin/bash
# TenderMind — serverni qayta ishga tushirish
#
# DIQQAT: bu faylga HECH QACHON API kalit yoki JWT secret yozmang.
# Barcha maxfiy qiymatlar .env faylida saqlanadi (.env git ga tushmaydi).

set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ .env fayli topilmadi. Avval quyidagini bajaring:"
  echo "   cp .env.example .env  &&  qiymatlarni to'ldiring"
  exit 1
fi

# .env dagi PORT ni o'qish (topilmasa 3002)
PORT=$(grep -E '^PORT=' .env | tail -n1 | cut -d'=' -f2 | tr -d ' \r')
PORT=${PORT:-3002}

echo "================================================"
echo "  TenderMind — Restart"
echo "================================================"
echo ""
echo "🛑 $PORT portidagi eski jarayonni to'xtatish..."
lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true
sleep 1

echo "🚀 Server ishga tushmoqda — http://localhost:$PORT"
echo ""
exec node server.js
