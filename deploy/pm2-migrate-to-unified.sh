#!/usr/bin/env bash
# Migra accounting, invoicing y loyalty a PM2 único (apaga systemd intimo-*).
# Ejecutar en EC2 como ubuntu: bash /opt/intimo/scripts/pm2-migrate-to-unified.sh
set -euo pipefail

ECOSYSTEM="/opt/intimo/ecosystem.config.js"

echo "=== PM2 migración unificada ==="
pm2 -v

echo "=== Rotación de logs ==="
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

echo "=== Detener systemd (evitar EADDRINUSE) ==="
sudo systemctl stop intimo-accounting intimo-invoicing intimo-loyalty 2>/dev/null || true

echo "=== PM2: recargar apps ==="
pm2 delete all 2>/dev/null || true
pm2 start "$ECOSYSTEM"
pm2 save

echo "=== Deshabilitar systemd intimo-* ==="
sudo systemctl disable intimo-accounting intimo-invoicing intimo-loyalty 2>/dev/null || true

echo "=== Startup al boot ==="
STARTUP=$(pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>&1 | grep "sudo env" || true)
if [[ -n "$STARTUP" ]]; then
  eval "$STARTUP"
fi

echo "=== Verificación (loyalty JVM ~5s) ==="
sleep 8
pm2 list
for url in "http://127.0.0.1:3010/health" "http://127.0.0.1:3000/health" "http://127.0.0.1:8080/health"; do
  echo -n "$url -> "
  curl -sS -m 8 -o /dev/null -w "HTTP %{http_code}\n" "$url" || echo "fail"
done

echo "=== Listo ==="
