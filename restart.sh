#!/bin/bash
# TenderMind AI Gemini - To'liq qayta ishga tushirish

echo "================================================"
echo "  TenderMind — Gemini AI Restart Script"
echo "================================================"
echo ""
echo "🛑 Barcha Node.js serverlarni o'chirish..."
killall node 2>/dev/null
sleep 2

echo "✅ Barcha serverlar to'xtatildi"
echo ""
echo "🚀 Port 3000 da yangi Gemini server ishga tushmoqda..."
echo ""

cd /Users/axmadullo/TenderMInd
GEMINI_API_KEY=AIzaSyB6msmY1FyyfClVuKf1VmXQQiTKPUkoqkc \
JWT_SECRET=tendermind-super-secret-key-change-in-production \
PORT=3000 \
node server.js
