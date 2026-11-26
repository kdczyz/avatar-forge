#!/usr/bin/env bash
# 把构建好的站点通过 cloudflared quick tunnel 暴露到公网，并打印 URL。
# 用法：scripts/publish.sh [端口，默认 4173]
# 注意：quick tunnel 的域名是临时的，进程结束或重启后换新域名。
set -euo pipefail

PORT="${1:-4173}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v cloudflared >/dev/null || { echo "需要 cloudflared：https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2; exit 1; }

npm run build
( fuser -k "$PORT/tcp" 2>/dev/null || true )
sleep 1
setsid npx vite preview > /tmp/avatar-forge-preview.log 2>&1 < /dev/null &
sleep 3
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || { echo "预览服务器没起来，看 /tmp/avatar-forge-preview.log" >&2; exit 1; }

: > /tmp/avatar-forge-tunnel.log
setsid cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate > /tmp/avatar-forge-tunnel.log 2>&1 < /dev/null &
for _ in $(seq 1 30); do
  sleep 2
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/avatar-forge-tunnel.log | head -1 || true)"
  [ -n "$URL" ] && break
done

if [ -z "${URL:-}" ]; then
  echo "没拿到隧道地址，看 /tmp/avatar-forge-tunnel.log" >&2
  exit 1
fi
echo "public: $URL"
echo "local : http://127.0.0.1:$PORT/"
