#!/usr/bin/env bash
# 自動套用 supabase/migrations/*.sql（之後不必再手動貼 SQL Editor）
#
# 需要下列其一（擇一寫進 .env.local，兩者都不在時本腳本會告訴你去哪拿）：
#   SUPABASE_DB_URL       ← 建議。Supabase 主控台 → Project Settings → Database → Connection string (URI)
#                            權限只及於這個專案的資料庫，範圍最小。需要 psql（apt install postgresql-client）
#   SUPABASE_ACCESS_TOKEN ← 備選。Account → Access Tokens 產生的 Personal Access Token
#                            不必裝任何東西（走 HTTPS），但權限及於整個 Supabase 帳號，範圍較大
#
# 已套用的 migration 記在 schema_migrations 表，重複執行安全（本專案 migration 本身也都冪等）。
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/groupscribe/.env.local}"
DIR="${MIGRATIONS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../supabase/migrations" && pwd)}"
[ -f "$ENV_FILE" ] || ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

run_sql() { # $1 = SQL 字串
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c "$1"
  else
    local ref payload code
    ref=$(printf '%s' "$SUPABASE_URL" | sed 's|https://||; s|\.supabase\.co.*||')
    payload=$(python3 -c 'import json,sys;print(json.dumps({"query":sys.stdin.read()}))' <<< "$1")
    code=$(curl -s -o /tmp/_mig.out -w '%{http_code}' \
      -X POST "https://api.supabase.com/v1/projects/$ref/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' -d "$payload")
    [ "$code" = "200" ] || wrong=1 && true
    if [ "$code" != "200" ]; then echo "  ✗ HTTP $code：$(head -c 300 /tmp/_mig.out)"; rm -f /tmp/_mig.out; return 1; fi
    rm -f /tmp/_mig.out
  fi
}

if [ -z "${SUPABASE_DB_URL:-}" ] && [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  cat <<'MSG'
缺少可執行 DDL 的憑證。二選一，加進 .env.local 後重跑本腳本：

  1) 建議（權限最小，只及於這個專案的資料庫）
     Supabase 主控台 → Project Settings → Database → Connection string → URI
     SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
     另需 psql：apt install -y postgresql-client

  2) 備選（不必裝東西，但權限及於整個 Supabase 帳號）
     Supabase 主控台 → 右上頭像 → Account → Access Tokens → Generate new token
     SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx

注意：service role key 只能讀寫資料，不能建立資料表或欄位（DDL），所以不適用。
MSG
  exit 1
fi

echo "套用來源：$DIR"
run_sql "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());"

applied_list=$(
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    psql "$SUPABASE_DB_URL" -tA -c "select name from schema_migrations;"
  else
    curl -s -X POST "https://api.supabase.com/v1/projects/$(printf '%s' "$SUPABASE_URL" | sed 's|https://||; s|\.supabase\.co.*||')/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
      -d '{"query":"select name from schema_migrations;"}' |
      python3 -c 'import json,sys;[print(r["name"]) for r in json.load(sys.stdin)]' 2>/dev/null || true
  fi
)

pending=0
for f in $(ls "$DIR"/*.sql | sort); do
  name=$(basename "$f")
  if printf '%s\n' "$applied_list" | grep -qx "$name"; then
    echo "  ─ $name（已套用）"
    continue
  fi
  echo "  ▶ $name"
  run_sql "$(cat "$f")"
  run_sql "insert into schema_migrations(name) values ('$name') on conflict (name) do nothing;"
  pending=$((pending + 1))
done
echo "完成：本次套用 $pending 個 migration"
