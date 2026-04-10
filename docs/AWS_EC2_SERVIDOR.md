# Desplegar IntimoInvoicing en EC2 (servidor tradicional, sin containers)

Esta guía es para correr **Node.js directamente** en una máquina virtual **EC2**. El flujo es: instancia Linux → instalar Node → copiar el proyecto → variables de entorno → proceso persistente (**systemd** o **PM2**) → opcional **Nginx** como proxy con HTTPS.

---

## 1. Red y seguridad (VPC)

- Usa la **VPC por defecto** o la misma donde tengas **RDS** si ya existe Postgres.
- Necesitarás un **Security Group** para la EC2 (ej. `sg-invoicing-ec2`).

**Reglas típicas del SG de la instancia:**

| Tipo | Puerto | Origen | Uso |
|------|--------|--------|-----|
| SSH | 22 | Tu IP / VPN | Administración |
| HTTP | 80 | 0.0.0.0/0 o ALB | Tráfico público (o solo desde Nginx/ALB) |
| HTTPS | 443 | 0.0.0.0/0 | Si pones TLS en Nginx |
| Custom TCP | 3000 | Solo localhost o SG del ALB | Node escuchando detrás de Nginx |

Para pruebas rápidas algunos abren **3000** al mundo; en producción es mejor **solo 80/443** y Nginx hace proxy a `127.0.0.1:3000`.

---

## 2. Crear la instancia EC2

1. Consola **EC2** → **Launch instance**.
2. **Nombre**: `intimo-invoicing` (o el que quieras).
3. **AMI**: **Amazon Linux 2023** o **Ubuntu Server 22.04 LTS**.
4. **Tipo**: `t3.small` o superior (según carga).
5. **Key pair**: crea o elige un `.pem` para SSH (guárdalo en un lugar seguro).
6. **Network**: subnets públicas si quieres IP pública y acceso directo desde internet.
7. **Auto-assign public IP**: **Enable** (si quieres entrar por IP pública sin bastion).
8. **Security group**: el creado arriba (SSH + 80/443 según plan).
9. **Storage**: 20–30 GiB gp3 suele bastar.
10. **Launch instance**.

Anota la **IP pública** o asigna una **Elastic IP** (EC2 → Elastic IPs → Allocate → Associate) para que no cambie al reiniciar.

---

## 3. RDS PostgreSQL (si aún no existe)

Igual que antes: Postgres en la **misma VPC**. En el **Security Group de RDS**, regla entrante **5432** desde el **SG de la instancia EC2** (`sg-invoicing-ec2`), no desde `0.0.0.0/0`.

Cadena `DATABASE_URL`:

`postgresql://USUARIO:PASSWORD@endpoint-rds.region.rds.amazonaws.com:5432/invoicing`

---

## 4. Conectarte por SSH

```bash
chmod 400 tu-clave.pem
ssh -i tu-clave.pem ec2-user@IP_PUBLICA   # Amazon Linux
# o
ssh -i tu-clave.pem ubuntu@IP_PUBLICA      # Ubuntu
```

---

## 5. Instalar Node.js 20 en el servidor

**Amazon Linux 2023** (ejemplo con Node desde repositorio de módulos o nvm):

```bash
sudo dnf install -y git
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
node -v
```

**Ubuntu**:

```bash
sudo apt update && sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

---

## 6. Subir el código

**Opción A — Git** (repositorio privado; configura deploy keys o token):

```bash
git clone https://github.com/TU_ORG/IntimoCafe.git
cd IntimoCafe/IntimoInvoicing
```

**Opción B — Desde tu Mac** (`rsync` o `scp`):

```bash
rsync -avz --exclude node_modules ./IntimoInvoicing/ ec2-user@IP:/home/ec2-user/intimo-invoicing/
```

En el servidor:

```bash
cd ~/IntimoCafe/IntimoInvoicing   # o ~/intimo-invoicing
npm install --omit=dev
cp .env.example .env
nano .env   # DATABASE_URL, FACTURAMA_*, PUBLIC_BASE_URL=https://TU_DOMINIO_O_IP
chmod 600 .env
```

`PUBLIC_BASE_URL` debe ser la URL que verán los clientes (dominio o `http://IP` en pruebas).

---

## 7. Proceso persistente (PM2)

```bash
sudo npm install -g pm2
cd ~/IntimoCafe/IntimoInvoicing
pm2 start src/index.js --name intimo-invoicing
pm2 save
pm2 startup
# Ejecuta el comando que te muestre pm2 startup (sudo env ...)
```

Comprueba: `curl -s http://127.0.0.1:3000/health`

---

## 8. Nginx como proxy (opcional, recomendado)

```bash
sudo dnf install -y nginx   # AL2023
# sudo apt install -y nginx  # Ubuntu
```

Archivo `/etc/nginx/conf.d/intimo.conf` (ejemplo):

```nginx
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl enable --now nginx
```

Prueba: `http://IP_PUBLICA/health`

**HTTPS**: instala **Certbot** con plugin Nginx y un dominio que apunte a la IP (Route 53 o tu DNS).

---

## 9. Secretos Facturama

- Puedes dejar usuario/contraseña solo en `.env` en el servidor (permisos `600`).
- O leer desde **AWS Secrets Manager** con un script de arranque que exporte variables (más trabajo en Node sin SDK).

Para empezar, **`.env` en disco** en la EC2 es aceptable si el SG de SSH está restringido y solo personal de confianza tiene acceso.

---

## 10. Checklist

| Paso | Dónde |
|------|--------|
| Instancia EC2 + SG | Consola EC2 |
| RDS + SG permite 5432 desde SG de EC2 | Consola RDS |
| Node 20 + `npm install` | SSH |
| `.env` con `DATABASE_URL`, Facturama, `PUBLIC_BASE_URL` | Servidor |
| PM2 o systemd | Servidor |
| Nginx 80→3000 | Servidor |
| DNS / Elastic IP | Route 53 o EC2 |

---

El despliegue previsto para este proyecto es **EC2 + Node** como en esta guía.
