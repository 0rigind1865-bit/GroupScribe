#!/usr/bin/env bash
# GroupScribe 每日備份（計劃 H 節第四批）
#
# 為什麼需要：知識庫本體（Postgres＋向量＋Storage 媒體原檔）都在 Supabase 雲端，
# 自架的只有應用層容器。一次帳號事故 = 全部歸零，而本產品的存在理由正是防止知識流失。
#
# 用 service role key 走 PostgREST 匯出 JSON（不需要另外的資料庫直連密碼），
# 媒體原檔逐一下載。全部落到 NAS 本機磁碟。
#
# 安裝（在 NAS 上）：
#   chmod +x /opt/groupscribe/scripts/backup.sh
#   crontab -e  →  15 4 * * * /opt/groupscribe/scripts/backup.sh >> /var/log/groupscribe-backup.log 2>&1
#
# 還原：JSON 可用 PostgREST POST 回去（注意先清空目標表避免主鍵衝突）；
# 媒體原檔用 supabase storage 的 upload API 逐一放回。
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/groupscribe/.env.local}"
DEST_ROOT="${BACKUP_DIR:-/opt/groupscribe-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
: "${SUPABASE_URL:?缺 SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?缺 SUPABASE_SERVICE_ROLE_KEY}"

STAMP=$(date +%Y-%m-%d)
DEST="$DEST_ROOT/$STAMP"
mkdir -p "$DEST/media"

hdr=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

echo "[$(date +%H:%M:%S)] 匯出資料表 → $DEST"
for t in channels groups messages media_assets embeddings events tasks notes consent_log app_settings api_usage push_subscriptions; do
  # 分頁匯出，避免大表一次拉爆記憶體
  offset=0; limit=1000; out="$DEST/$t.json"; echo -n '[' > "$out"; first=1
  while :; do
    page=$(curl -fsS "${hdr[@]}" "$SUPABASE_URL/rest/v1/$t?select=*&limit=$limit&offset=$offset" || echo '[]')
    n=$(printf '%s' "$page" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
    [ "$n" -eq 0 ] && break
    body=$(printf '%s' "$page" | python3 -c 'import json,sys;print(",".join(json.dumps(r,ensure_ascii=False) for r in json.load(sys.stdin)))')
    [ $first -eq 0 ] && echo -n ',' >> "$out"; first=0
    printf '%s' "$body" >> "$out"
    offset=$((offset + limit)); [ "$n" -lt "$limit" ] && break
  done
  echo ']' >> "$out"
  echo "  $t: $(python3 -c "import json;print(len(json.load(open('$out'))))" 2>/dev/null || echo '?') 列"
done

echo "[$(date +%H:%M:%S)] 下載媒體原檔"
python3 - "$DEST" <<'PY' | while read -r path; do
import json, sys, os
dest = sys.argv[1]
rows = json.load(open(os.path.join(dest, 'media_assets.json')))
for r in rows:
    if r.get('storage_path'): print(r['storage_path'])
PY
  enc=$(python3 -c "import urllib.parse,sys;print('/'.join(urllib.parse.quote(p) for p in sys.argv[1].split('/')))" "$path")
  target="$DEST/media/$(printf '%s' "$path" | tr '/' '_')"
  # Storage 需要 apikey 與 Authorization 兩個 header（只給後者會回 400 Bucket not found）
  [ -f "$target" ] || curl -fsS "${hdr[@]}" \
    "$SUPABASE_URL/storage/v1/object/media/$enc" -o "$target" || echo "  ⚠ 下載失敗：$path"
done

du -sh "$DEST" | sed 's/^/[完成] /'
find "$DEST_ROOT" -maxdepth 1 -type d -name '20*' -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true
echo "[$(date +%H:%M:%S)] 備份完成，保留 $KEEP_DAYS 天"
