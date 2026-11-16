#!/usr/bin/env bash
# Despliegue de Qullqa en una VM de Azure (mismo docker compose que en GCP).
#   ./infra/azure.sh create   → grupo + VM Ubuntu 24.04 (Standard_B2s) con IP fija, puertos 80/443 y Docker
#   ./infra/azure.sh setup    → (VM creada en el portal) solo instala Docker
#   ./infra/azure.sh ip       → IP fija (para el registro A en Porkbun)
#   ./infra/azure.sh deploy   → sube el último commit, genera .env de producción si no existe y levanta todo
#   ./infra/azure.sh secrets  → copia SOLO las claves de datos (Earthdata, Planetary Computer, Meteomatics) ADMIN_PHONES y claves VAPID al .env de la VM
#   ./infra/azure.sh logs     → logs en vivo
#   ./infra/azure.sh backup   → respaldo inmediato de la base → ./backups/ (además hay uno diario automático en la VM)
#   ./infra/azure.sh warmup   → calienta la app antes de presentar
# Requiere: az login (y az account set --subscription <id> si tienes varias).
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${QULLQA_RG:-qullqa}
VM=${QULLQA_VM:-qullqa}
LOCATION=${QULLQA_LOCATION:-brazilsouth}   # São Paulo; prueba chilecentral si tu suscripción lo permite
SIZE=${QULLQA_SIZE:-Standard_B2s}          # 2 vCPU, 4 GB
DOMAIN=${QULLQA_DOMAIN:-qullqa.us}
# VM ya creada en el portal: VM_HOST / VM_USER / VM_SSH_KEY en .env (sin az)
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }
HOST=${QULLQA_HOST:-$(env_get VM_HOST)}
USER_VM=${QULLQA_USER:-$(env_get VM_USER)}; USER_VM=${USER_VM:-qullqa}
KEY=$(env_get VM_SSH_KEY); KEY=${KEY/#\~/$HOME}
SSH=(ssh -o StrictHostKeyChecking=accept-new ${KEY:+-i "$KEY"})

vm_ip() { if [[ -n "$HOST" ]]; then echo "$HOST"; else az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv; fi; }
ssh_vm() { "${SSH[@]}" "$USER_VM@$(vm_ip)" "$1"; }

case "${1:-}" in
  create)
    az group create -n "$RG" -l "$LOCATION" -o none
    az vm create -g "$RG" -n "$VM" --image Canonical:ubuntu-24_04-lts:server:latest --size "$SIZE" \
      --admin-username "$USER_VM" --generate-ssh-keys --public-ip-sku Standard \
      --public-ip-address-allocation static --os-disk-size-gb 30 -o none
    az vm open-port -g "$RG" -n "$VM" --port 80,443 --priority 900 -o none
    echo "Instalando Docker…"
    ssh_vm 'sudo apt-get update -q && sudo apt-get install -y -q docker.io docker-compose-v2'
    echo "✓ VM lista. IP fija: $(vm_ip)"
    ;;
  setup)   # VM creada en el portal: solo instala Docker
    ssh_vm 'sudo apt-get update -q && sudo apt-get install -y -q docker.io docker-compose-v2 && sudo docker --version && sudo docker compose version'
    ;;
  ip)
    vm_ip
    ;;
  deploy)
    git diff --quiet || echo "⚠ Hay cambios sin commit: se despliega el último commit."
    git archive --format=tar.gz HEAD | "${SSH[@]}" "$USER_VM@$(vm_ip)" 'mkdir -p ~/qullqa && tar xz -C ~/qullqa'
    # .env de producción: se genera UNA vez en la VM con secretos nuevos (nunca se copia el .env local entero)
    ssh_vm "cd ~/qullqa && if [ ! -f .env ]; then
      P=\$(openssl rand -hex 16); J=\$(openssl rand -hex 32)
      printf 'PUBLIC_DOMAIN=%s\nPUBLIC_URL=https://%s\nPOSTGRES_USER=qullqa\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=qullqa\nJWT_SECRET=%s\n' '$DOMAIN' '$DOMAIN' \$P \$J > .env
      chmod 600 .env; fi
      sed -i 's/^PUBLIC_DOMAIN=.*/PUBLIC_DOMAIN=$DOMAIN/; s|^PUBLIC_URL=.*|PUBLIC_URL=https://$DOMAIN|' .env
      sudo docker compose -f infra/docker-compose.prod.yml --env-file .env up -d --build"
    echo "✓ Desplegado. Prueba: curl https://$DOMAIN/api/health"
    ;;
  secrets)
    # Solo estas variables, leídas del .env local; nunca salen por la terminal.
    keys='^(EARTHDATA_TOKEN|PC_SDK_SUBSCRIPTION_KEY|METEOMATICS_USERNAME|METEOMATICS_PASSWORD|ADMIN_PHONES|VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT)='
    grep -E "$keys" .env | "${SSH[@]}" "$USER_VM@$(vm_ip)" "cd ~/qullqa && grep -vE '$keys' .env > .env.tmp; cat >> .env.tmp; mv .env.tmp .env; chmod 600 .env"
    ssh_vm "cd ~/qullqa && sudo docker compose -f infra/docker-compose.prod.yml --env-file .env up -d"
    echo "✓ Claves de datos copiadas y servicios reiniciados."
    ;;
  logs)
    ssh_vm 'cd ~/qullqa && sudo docker compose -f infra/docker-compose.prod.yml --env-file .env logs -f --tail 100'
    ;;
  backup)
    # Respaldo inmediato de la base de producción, directo por SSH a ./backups/ (no se commitea)
    mkdir -p backups
    f="backups/qullqa-$(date +%Y%m%d-%H%M).dump"
    ssh_vm "sudo docker exec qullqa-prod-db-1 sh -c 'pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB -Fc'" > "$f"
    echo "✓ $f ($(du -h "$f" | cut -f1)). Restaurar: pg_restore --clean -d <DATABASE_URL> $f"
    ssh_vm "ls -1 /var/backups/qullqa 2>/dev/null | tail -3" || true
    ;;
  warmup)
    for p in /api/health / /manifest.webmanifest; do curl -s -o /dev/null -w "%{http_code} %{time_total}s $p\n" "https://$DOMAIN$p"; done
    ;;
  *)
    sed -n '2,11p' "$0"; exit 1 ;;
esac
