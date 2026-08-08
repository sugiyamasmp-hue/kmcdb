#!/usr/bin/env bash
#
# Supabase プロジェクトを再起動し、ACTIVE_HEALTHY になるまで状態を確認する。
#
# 使い方:
#   export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx   # https://supabase.com/dashboard/account/tokens
#   ./scripts/supabase-restart.sh               # 既定のプロジェクト ref を再起動
#   ./scripts/supabase-restart.sh <project_ref> # ref を明示指定
#
#   ./scripts/supabase-restart.sh --status      # 再起動せず状態確認のみ
#   ./scripts/supabase-restart.sh --restore     # 一時停止(PAUSED)からの復帰
#
set -euo pipefail

API="https://api.supabase.com/v1"
DEFAULT_REF="wxuqqkpgyfkpuejvvzix"

ACTION="restart"
REF=""

for arg in "$@"; do
  case "$arg" in
    --status)  ACTION="status" ;;
    --restore) ACTION="restore" ;;
    --restart) ACTION="restart" ;;
    -h|--help)
      tail -n +2 "$0" | sed -n '/^#/!q; s/^# \{0,1\}//p'
      exit 0
      ;;
    -*)
      echo "不明なオプション: $arg" >&2
      exit 2
      ;;
    *) REF="$arg" ;;
  esac
done

REF="${REF:-${SUPABASE_PROJECT_REF:-$DEFAULT_REF}}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "❌ SUPABASE_ACCESS_TOKEN が未設定です。" >&2
  echo "   https://supabase.com/dashboard/account/tokens で発行し、" >&2
  echo "   export SUPABASE_ACCESS_TOKEN=sbp_xxx を実行してください。" >&2
  exit 1
fi

auth=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")

# 状態を取得して "<HTTPコード> <status>" を返す
fetch_status() {
  local body code
  body="$(curl -sS -w $'\n%{http_code}' "${auth[@]}" "${API}/projects/${REF}" || true)"
  code="$(printf '%s' "$body" | tail -n1)"
  case "$code" in ''|*[!0-9]*) code="000" ;; esac
  body="$(printf '%s' "$body" | sed '$d')"
  local status
  status="$(printf '%s' "$body" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("status", "UNKNOWN"))
except Exception:
    print("UNPARSEABLE")' 2>/dev/null || echo "UNPARSEABLE")"
  printf '%s %s' "$code" "$status"
}

echo "プロジェクト: ${REF}"

read -r code status <<<"$(fetch_status)"
if [ "$code" != "200" ]; then
  echo "❌ 状態取得に失敗しました (HTTP ${code})。トークンと project ref を確認してください。" >&2
  exit 1
fi
echo "現在の状態: ${status}"

case "$ACTION" in
  status)
    exit 0
    ;;
  restore)
    endpoint="${API}/projects/${REF}/restore"
    label="復帰(restore)"
    ;;
  restart)
    if [ "$status" = "INACTIVE" ] || [ "$status" = "PAUSED" ]; then
      echo "⚠️  一時停止中のプロジェクトは restart では起動しません。--restore を使ってください。" >&2
      exit 1
    fi
    endpoint="${API}/projects/${REF}/restart"
    label="再起動(restart)"
    ;;
esac

echo "${label} を実行します..."
resp="$(curl -sS -X POST -w $'\n%{http_code}' "${auth[@]}" "$endpoint" || true)"
resp_code="$(printf '%s' "$resp" | tail -n1)"
resp_body="$(printf '%s' "$resp" | sed '$d')"
case "$resp_code" in ''|*[!0-9]*) resp_code="000" ;; esac

if [ "$resp_code" -lt 200 ] || [ "$resp_code" -ge 300 ]; then
  echo "❌ ${label} に失敗しました (HTTP ${resp_code}): ${resp_body}" >&2
  exit 1
fi
echo "✅ ${label} を受け付けました (HTTP ${resp_code})"

# ACTIVE_HEALTHY になるまで最大 5 分待つ
echo "状態が ACTIVE_HEALTHY になるまで待機します..."
for i in $(seq 1 30); do
  sleep 10
  read -r code status <<<"$(fetch_status)"
  echo "  [${i}/30] HTTP ${code} / ${status}"
  if [ "$code" = "200" ] && [ "$status" = "ACTIVE_HEALTHY" ]; then
    echo "✅ プロジェクトは ACTIVE_HEALTHY です。"
    exit 0
  fi
done

echo "⚠️  5 分以内に ACTIVE_HEALTHY になりませんでした。最終状態: ${status}" >&2
exit 1
