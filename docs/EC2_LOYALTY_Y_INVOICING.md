# EC2: Loyalty + Invoicing en la misma máquina

En una sola instancia **EC2** puedes correr **dos servicios backend** y un **Nginx** que enrute el tráfico HTTPS y sirva de único punto de entrada.

## Aclaración de stack

| Servicio | Tecnología en este repo | Puerto típico (interno) |
|----------|-------------------------|-------------------------|
| **Loyalty** | **Ktor (Kotlin/JVM)** — *no* es Node | `8080` |
| **Invoicing** | **Node.js (Express)** | `3000` |

Las apps móviles y el mesa apuntan a la API de Loyalty; el sistema de facturación usa rutas bajo `/api` y archivos estáticos desde `public/`.

---

## Arquitectura recomendada

```
Internet :443
    → Nginx (TLS)
         → proxy_pass http://127.0.0.1:8080   # Loyalty (Ktor), ej. api.tudominio.com
         → proxy_pass http://127.0.0.1:3000   # Invoicing (Node), ej. facturacion.tudominio.com
```

- **Security group**: abre **22** (tu IP), **80** y **443** al mundo. **No** abras `8080` ni `3000` a `0.0.0.0/0`; solo localhost + Nginx.
- **Elastic IP** asociada a la instancia para DNS estable.

---

## Consola AWS — paso a paso (orden recomendado)

Haz todo en **la misma región** (ej. `us-east-1`, `mx-central-1`, la que uses ya con RDS si aplica).

### 1) Elegir región

1. Arriba a la derecha en la consola AWS, elige la **región** donde quieres la máquina (y donde esté Postgres si ya usas **RDS**).

### 2) Par de claves SSH (si no tienes uno)

1. **EC2** → menú izquierdo **Key Pairs** (bajo “Network & Security”) o al lanzar la instancia te lo pedirá.
2. **Create key pair** → nombre `intimo-ec2`, tipo **RSA** o **ED25519**, formato **.pem**.
3. Descarga el `.pem` y guárdalo en un sitio seguro (`chmod 400` en Mac/Linux antes de `ssh`).

### 3) Security group (firewall de la instancia)

1. **EC2** → **Security Groups** → **Create security group**.
2. **Nombre**: `sg-intimo-ec2` (ejemplo).
3. **VPC**: la predeterminada o la misma donde esté **RDS** (si tu base es RDS).
4. **Inbound rules** (entrantes):

| Tipo | Puerto | Origen | Uso |
|------|--------|--------|-----|
| SSH | 22 | **Mi IP** (o tu VPN) | Administración; evita `0.0.0.0/0` en 22 si puedes |
| HTTP | 80 | 0.0.0.0/0 | Redirección a HTTPS y validación Let’s Encrypt |
| HTTPS | 443 | 0.0.0.0/0 | Nginx (Loyalty + Invoicing) |

5. **No** añadas 8080 ni 3000 desde internet: Loyalty y Node solo escucharán en la propia máquina; Nginx es el único frente público.
6. Guarda el security group y **anota su ID** (ej. `sg-0abc…`).

### 4) RDS (solo si la base PostgreSQL está en AWS)

- Si **ya tienes** RDS: en el **Security Group del RDS**, regla entrante **PostgreSQL 5432** con origen el **security group** `sg-intimo-ec2` (no la IP pública). Así solo tu EC2 habla con la base.
- Si la base sigue **en la misma VM** (no recomendado a largo plazo): este paso no aplica hasta que migres a RDS.

### 5) Lanzar la instancia EC2

1. **EC2** → **Instances** → **Launch instance**.
2. **Nombre**: `intimo-prod` (o el que quieras).
3. **AMI**: **Amazon Linux 2023** o **Ubuntu 22.04 LTS**.
4. **Tipo de instancia**: `t3.small` (mínimo razonable para JVM + Node + Nginx); si vas justo de RAM, `t3.medium`.
5. **Key pair**: el `.pem` que creaste.
6. **Network settings**:
   - Marca **Allow HTTPS** y **Allow HTTP** del firewall (o selecciona el **security group** `sg-intimo-ec2` que creaste).
   - **Auto-assign public IP**: **Enable** (necesitas IP pública para SSH y para Nginx hasta que pongas Elastic IP).
7. **Almacenamiento**: **gp3**, 30 GiB suele bastar.
8. **Launch instance**.

### 6) Elastic IP (IP fija)

1. **EC2** → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**.
2. Selecciona la IP → **Actions** → **Associate Elastic IP address** → elige tu **instancia** y la interfaz de red → **Associate**.

Así el DNS no se rompe cuando reinicies la VM.

### 7) DNS (dominio público)


1. En **Route 53** (o en tu registrador: GoDaddy, Cloudflare, etc.) crea registros:
   - `api.tudominio.com` → **A** → IP elástica.
   - `facturacion.tudominio.com` → **A** → la misma IP (Nginx separa por `server_name`).
2. Espera a que propaguen (minutos a horas según TTL).

### 8) Conectarte por SSH (primera vez)

En tu Mac (o PC con WSL):

```bash
chmod 400 ~/Downloads/intimo-ec2.pem
ssh -i ~/Downloads/intimo-ec2.pem ec2-user@TU_ELASTIC_IP   # Amazon Linux
# o
ssh -i ~/Downloads/intimo-ec2.pem ubuntu@TU_ELASTIC_IP      # Ubuntu
```

Si entras, la parte **Amazon (consola)** está lista. Lo siguiente es **dentro del servidor**: instalar **Java 17**, **Node 20**, **Nginx**, subir el JAR de Loyalty y el proyecto Invoicing, **systemd**, certificados **Let’s Encrypt** y la configuración de Nginx de más abajo en este documento.

### Resumen de checklist en AWS

| Paso | Dónde | Qué |
|------|--------|-----|
| Región | Barra superior | Una sola región para EC2 (y RDS si aplica) |
| Key pair | EC2 | `.pem` para SSH |
| Security group | EC2 | 22 (tu IP), 80, 443 |
| Instancia | EC2 | Linux, t3.small+, disco gp3 |
| Elastic IP | EC2 | Asociada a la instancia |
| DNS | Route 53 / registrador | A → Elastic IP |
| RDS | RDS (opcional) | 5432 desde SG de la EC2 |

---

## 1. Loyalty (JVM / Ktor)

Desde el repo `IntimoCoffeeLoyaltyServer`:

```bash
./gradlew shadowJar
# genera build/libs/intimo-loyalty-server-all.jar
```

Variables (equivalente a `application.conf`): `PORT=8080`, `DB_URL`, `DB_USER`, `DB_PASSWORD`.

### systemd — `/etc/systemd/system/intimo-loyalty.service`

```ini
[Unit]
Description=Intimo Coffee Loyalty API (Ktor)
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/intimo/loyalty
EnvironmentFile=/opt/intimo/loyalty/loyalty.env
ExecStart=/usr/bin/java -jar /opt/intimo/loyalty/intimo-loyalty-server-all.jar
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`loyalty.env` (permisos `600`):

```env
PORT=8080
DB_URL=jdbc:postgresql://HOST_RDS:5432/intimo_loyalty
DB_USER=...
DB_PASSWORD=...
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now intimo-loyalty
curl -s http://127.0.0.1:8080/health
```

---

## 2. Invoicing (Node.js)

Desde el repo `IntimoInvoicing`:

```bash
cd /opt/intimo/invoicing
npm install --omit=dev
# copiar .env según docs del proyecto (Facturama, SMTP, etc.)
```

`PORT=3000` en el `.env` o entorno.

### systemd — `/etc/systemd/system/intimo-invoicing.service`

```ini
[Unit]
Description=Intimo Invoicing (Node)
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/intimo/invoicing
Environment=NODE_ENV=production
EnvironmentFile=/opt/intimo/invoicing/.env
ExecStart=/usr/bin/node /opt/intimo/invoicing/src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

(O usa **PM2** si ya lo usas en otro proyecto: `pm2 start src/index.js --name intimo-invoicing` y `pm2 save`.)

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now intimo-invoicing
curl -s http://127.0.0.1:3000/health
```

---

## 3. Nginx como “servidor web” frontal

Instalación (Amazon Linux 2023):

```bash
sudo dnf install -y nginx
```

Certificados con **Certbot** (Let’s Encrypt) o ACM en un balanceador si más adelante escalas.

### Ejemplo — dos subdominios

`/etc/nginx/conf.d/intimo.conf` (ajusta nombres y rutas de certificados):

```nginx
# Loyalty API — apps y tablets
server {
    listen 443 ssl http2;
    server_name api.tudominio.com;

    ssl_certificate     /etc/letsencrypt/live/api.tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Invoicing — UI estática + /api
server {
    listen 443 ssl http2;
    server_name facturacion.tudominio.com;

    ssl_certificate     /etc/letsencrypt/live/facturacion.tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/facturacion.tudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.tudominio.com facturacion.tudominio.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. DNS y clientes

- **Loyalty (apps Android/iOS/Waiter)**: URL base `https://api.tudominio.com` (sin puerto; el path sigue siendo `/loyalty/...` como define el servidor Ktor).
- **Invoicing**: `PUBLIC_BASE_URL` / enlaces en correos deben usar `https://facturacion.tudominio.com` (ver `IntimoInvoicing` y `.env`).

---

## 5. Orden de despliegue sugerido

1. JDK 17 + JAR de Loyalty + `loyalty.env` + `systemctl start intimo-loyalty`.
2. Node 20 + `npm install` + `.env` de Invoicing + `systemctl start intimo-invoicing`.
3. Nginx + TLS + comprobar ambos `curl` vía HTTPS.
4. Actualizar DNS y variables en clientes.

---

## Referencias en el repo

- Invoicing (Node, PM2, variables): `IntimoInvoicing/docs/AWS_EC2_SERVIDOR.md`
- Invoicing rutas y `public/`: `IntimoInvoicing/src/index.js`
- Loyalty (puerto y BD): `IntimoCoffeeLoyaltyServer/src/main/resources/application.conf`

Si en el futuro quisieras **Loyalty en Node**, habría que **reimplementar** la API; el código actual es solo Ktor/JVM.
