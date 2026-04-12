#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ضع SUPABASE_DB_URL في ملف .env في جذر ostadi (انظر env.example) ثم أعد التشغيل." >&2
  exit 1
fi

exec npx supabase db push --db-url "$SUPABASE_DB_URL" --yes "$@"
