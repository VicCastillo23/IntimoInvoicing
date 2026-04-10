#!/usr/bin/env bash
# Instala Nginx en Ubuntu, aplica proxy para api / facturación y obtiene certificados Let's Encrypt.
# Requisitos: DNS de api.cafeintimo.mx y facturacion.cafeintimo.mx → IP de esta máquina;
# Security group con 80 y 443 abiertos; servicios Loyalty :8080 e Invoicing :3000 activos (systemd).
#
# Uso en la EC2 (Ubuntu):
#   chmod +x install-nginx-tls.sh
#   export CERTBOT_EMAIL=tu@correo.com
#   sudo -E ./install-nginx-tls.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_SRC="${SCRIPT_DIR}/nginx-cafeintimo.conf"
CONF_DST="/etc/nginx/sites-available/cafeintimo.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta con sudo: sudo -E $0"
  exit 1
fi

if [[ ! -f "${CONF_SRC}" ]]; then
  echo "No se encuentra ${CONF_SRC}"
  exit 1
fi

if [[ -z "${CERTBOT_EMAIL:-}" ]]; then
  echo "Define el correo para Let's Encrypt, por ejemplo:"
  echo "  export CERTBOT_EMAIL=admin@cafeintimo.mx"
  echo "  sudo -E ${SCRIPT_DIR}/install-nginx-tls.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

cp -a "${CONF_SRC}" "${CONF_DST}"
ln -sf "${CONF_DST}" /etc/nginx/sites-enabled/cafeintimo.conf

nginx -t
systemctl enable nginx
systemctl reload nginx

# Certificado SAN para ambos hostnames y redirección HTTP→HTTPS
certbot --nginx \
  --non-interactive \
  --agree-tos \
  -m "${CERTBOT_EMAIL}" \
  -d api.cafeintimo.mx \
  -d facturacion.cafeintimo.mx \
  --redirect

nginx -t
systemctl reload nginx

echo ""
echo "Listo. Prueba desde tu Mac:"
echo "  curl -sS https://facturacion.cafeintimo.mx/health"
echo "  curl -sS https://api.cafeintimo.mx/health   # si tu JAR de Loyalty expone /health"
echo ""
echo "En el servidor (servicios locales):"
echo "  curl -sS http://127.0.0.1:3000/health"
echo "  curl -sS http://127.0.0.1:8080/health"
echo ""
echo "Invoicing: en el .env del servidor pon NODE_ENV=production y"
echo "  PUBLIC_BASE_URL=https://facturacion.cafeintimo.mx"
echo "  (ver deploy/invoicing-env-production.snippet en este repo)"
