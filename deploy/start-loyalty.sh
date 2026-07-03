#!/usr/bin/env bash
# Carga loyalty.env y arranca el JAR (PM2 / systemd).
set -euo pipefail
set -a
# shellcheck source=/dev/null
source /opt/intimo/loyalty/loyalty.env
set +a
exec /usr/bin/java -Xmx512m -jar /opt/intimo/loyalty/intimo-loyalty-server-all.jar
