#!/usr/bin/env bash
# Despliegue de Qullqa en una VM de Google Cloud (Compute Engine).
#   ./infra/gcp.sh create   → crea IP fija + VM (Ubuntu, e2-medium, Santiago) + firewall 80/443 e instala Docker
#   ./infra/gcp.sh ip       → muestra la IP fija (para el registro A en GoDaddy)
#   ./infra/gcp.sh deploy   → sube el código (último commit), genera .env de producción si no existe y levanta todo
#   ./infra/gcp.sh logs     → logs en vivo
#   ./infra/gcp.sh warmup   → calienta la app antes de presentar
# Requiere: gcloud autenticado (gcloud auth login) y proyecto elegido (gcloud config set project <id>).
set -euo pipefail
cd "$(dirname "$0")/.."

VM=${QULLQA_VM:-qullqa}
REGION=${QULLQA_REGION:-southamerica-west1}   # Santiago: la región más cercana a Arequipa
ZONE=${QULLQA_ZONE:-${REGION}-a}
DOMAIN=${QULLQA_DOMAIN:-}
ssh_vm() { gcloud compute ssh "$VM" --zone "$ZONE" --command "$1"; }

case "${1:-}" in
  create)
    gcloud services enable compute.googleapis.com
    gcloud compute addresses describe qullqa-ip --region "$REGION" >/dev/null 2>&1 ||
      gcloud compute addresses create qullqa-ip --region "$REGION"
    gcloud compute firewall-rules describe qullqa-web >/dev/null 2>&1 ||
      gcloud compute firewall-rules create qullqa-web --allow tcp:80,tcp:443,udp:443 --target-tags qullqa-web
    gcloud compute instances create "$VM" --zone "$ZONE" --machine-type e2-medium \
      --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud --boot-disk-size 30GB \
      --address qullqa-ip --tags qullqa-web
    echo "Esperando a que la VM arranque…"; sleep 40
    ssh_vm 'sudo apt-get update -q && sudo apt-get install -y -q docker.io docker-compose-v2 && sudo usermod -aG docker $USER'
    echo "✓ VM lista. IP fija: $(gcloud compute addresses describe qullqa-ip --region "$REGION" --format='value(address)')"
    ;;
  ip)
    gcloud compute addresses describe qullqa-ip --region "$REGION" --format='value(address)'
    ;;
  deploy)
    [[ -n "$DOMAIN" ]] || { echo "Define el dominio: QULLQA_DOMAIN=midominio.com ./infra/gcp.sh deploy"; exit 1; }
    git diff --quiet || echo "⚠ Hay cambios sin commit: se despliega el último commit."
    git archive --format=tar.gz HEAD | gcloud compute ssh "$VM" --zone "$ZONE" --command 'mkdir -p ~/qullqa && tar xz -C ~/qullqa'
    # .env de producción: se genera UNA vez en la VM con secretos nuevos (nunca se copia el .env local)
    ssh_vm "cd ~/qullqa && if [ ! -f .env ]; then
      P=\$(openssl rand -hex 16); J=\$(openssl rand -hex 32)
      printf 'PUBLIC_DOMAIN=%s\nPUBLIC_URL=https://%s\nPOSTGRES_USER=qullqa\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=qullqa\nJWT_SECRET=%s\nEARTHDATA_TOKEN=\n' '$DOMAIN' '$DOMAIN' \$P \$J > .env
      chmod 600 .env; fi
      sed -i 's/^PUBLIC_DOMAIN=.*/PUBLIC_DOMAIN=$DOMAIN/; s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|' .env
      sudo docker compose -f infra/docker-compose.prod.yml --env-file .env up -d --build"
    echo "✓ Desplegado. Prueba: curl https://$DOMAIN/api/health"
    ;;
  logs)
    ssh_vm 'cd ~/qullqa && sudo docker compose -f infra/docker-compose.prod.yml logs -f --tail 100'
    ;;
  warmup)
    [[ -n "$DOMAIN" ]] || { echo "QULLQA_DOMAIN=midominio.com ./infra/gcp.sh warmup"; exit 1; }
    for p in /api/health / /manifest.webmanifest; do curl -s -o /dev/null -w "%{http_code} %{time_total}s $p\n" "https://$DOMAIN$p"; done
    ;;
  *)
    sed -n '2,9p' "$0"; exit 1 ;;
esac
