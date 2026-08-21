#!/usr/bin/env bash
# Первая отправка проекта на GitHub.
# Запуск:  bash push.sh
set -euo pipefail

REMOTE="${1:-https://github.com/sde9/payment_tracker_v02.git}"
cd "$(dirname "$0")"

if [ ! -d .git ]; then
  git init -b main
fi

git add -A
if git diff --cached --quiet; then
  echo "Изменений нет, коммит не нужен."
else
  git commit -m "Уроки и оплаты: учёт предоплаченных занятий"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi

git push -u origin main
echo "Готово: $REMOTE"
