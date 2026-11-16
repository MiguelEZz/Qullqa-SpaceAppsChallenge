#!/usr/bin/env bash
# Expone Caddy (puerto 8080) en el dominio público.
# Plan B: ngrok con dominio estático (NGROK_DOMAIN). Si PUBLIC_TUNNEL=cloudflare, usa cloudflared.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

if [[ "${PUBLIC_TUNNEL:-ngrok}" == "cloudflare" ]]; then
  exec cloudflared tunnel run qullqa
else
  exec ngrok http --url="https://${NGROK_DOMAIN}" "${CADDY_PORT:-8080}"
fi
