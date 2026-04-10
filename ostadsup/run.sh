#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$ROOT/web"

cd "$WEB"

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    echo "[Ostadi] إنشاء web/.env من .env.example — عدّل VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY"
    cp .env.example .env
  else
    echo "[Ostadi] خطأ: لا يوجد web/.env ولا .env.example" >&2
    exit 1
  fi
fi

if [[ ! -d node_modules ]]; then
  echo "[Ostadi] تثبيت الاعتمادات…"
  npm install
fi

echo "[Ostadi] تشغيل خادم التطوير — http://localhost:5173"
exec npm run dev
