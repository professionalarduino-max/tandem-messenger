#!/usr/bin/env bash
# Поднять превью после перезапуска песочницы: node_modules там не сохраняются.
set -e
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "node_modules нет — ставлю зависимости…"
  npm ci || npm install
fi

exec npm run dev -- --host 0.0.0.0 --port 5173
