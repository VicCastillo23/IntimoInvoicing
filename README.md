# IntimoInvoicing — Guía de inicio

Servicio Node.js (Express) para **facturación CFDI** vía Facturama. En AWS se despliega en un **servidor EC2** con Node instalado directamente (ver **[docs/AWS_EC2_SERVIDOR.md](docs/AWS_EC2_SERVIDOR.md)**). Los datos sensibles van en `.env` en el servidor o en **Secrets Manager**.

---

## Paso 1 — Prerrequisitos en tu máquina

- **Node.js 20+** (`node -v`)
- Cuenta **Facturama sandbox** con usuario/clave de **API** (no solo la web)

---

## Paso 2 — Configuración local

```bash
cd IntimoInvoicing
cp .env.example .env
```

Edita `.env` y pon al menos:

- `FACTURAMA_USER` / `FACTURAMA_PASSWORD` (sandbox)
- `PUBLIC_BASE_URL=http://localhost:3000` (para pruebas locales)
- **CSD (certificado de prueba SAT)** para Facturama multiemisor: `FACTURAMA_EMISOR_RFC`, `FACTURAMA_CSD_CERTIFICATE_BASE64`, `FACTURAMA_CSD_PRIVATE_KEY_BASE64`, `FACTURAMA_CSD_PRIVATE_KEY_PASSWORD` — ver **[docs/ENV_CSD.md](docs/ENV_CSD.md)** (valores solo en `.env`, nunca en Git).
- `DATABASE_URL` cuando tengas PostgreSQL (local o RDS); hasta entonces el servidor arranca sin BD en el código actual.
- **Correo con adjuntos (opcional):** con SMTP configurado, tras timbrar en Facturama se envía al correo del receptor el **PDF y XML** (vía `nodemailer`). **Gmail (`cafeintimo0@gmail.com`):** `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` — ver **[docs/ENV_SMTP_GMAIL.md](docs/ENV_SMTP_GMAIL.md)**. Prueba rápida: `npm run smtp:ping`.

---

## Paso 3 — Ejecutar en desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000/health](http://localhost:3000/health). Debe responder JSON con `ok: true` y `facturamaConfigured: true` si pusiste usuario y contraseña.

- **Vista administrador:** [http://localhost:3000/](http://localhost:3000/) (listado de órdenes y facturas).
- **Vista cliente (QR / ticket):** [http://localhost:3000/cliente.html](http://localhost:3000/cliente.html) — solo busca una orden y factura. Para el QR usa `PUBLIC_BASE_URL` + `?orderId=ord-XXX` (o `?n=NÚMERO_DE_ORDEN`).

---

## Paso 4 — Cargar CSD en Facturama (sandbox)

Solo después de tener credenciales API válidas. Usa los **certificados de prueba del SAT** que indique Facturama (RFC de prueba típico `EKU9003173C9`).

Ejemplo con `curl` (sustituye los valores; **no** subas llaves reales al repo):

```bash
curl -sS -u "$FACTURAMA_USER:$FACTURAMA_PASSWORD" \
  -H "Content-Type: application/json" \
  -X POST "https://apisandbox.facturama.mx/api-lite/csds" \
  -d @csd-payload.json
```

El JSON debe incluir `Rfc`, `Certificate`, `PrivateKey`, `PrivateKeyPassword` en base64 según la documentación Facturama.

Equivalente desde este repo (lee tu `.env`):

```bash
npm run facturama:upload-csd
```

Si el CSD **ya estaba** cargado, el script lo indica y termina bien (no es fallo). Para **actualizar** certificado/llave: `npm run facturama:upload-csd -- --update`.

---

## Paso 5 — AWS (producción / pruebas en nube)

Guía paso a paso en la consola y por SSH: **[docs/AWS_EC2_SERVIDOR.md](docs/AWS_EC2_SERVIDOR.md)**  
(EC2, security groups, RDS, Node 20, PM2, Nginx opcional, Elastic IP.)

En la **misma EC2** que el API de Loyalty (Ktor) y Nginx: **[../docs/EC2_LOYALTY_Y_INVOICING.md](../docs/EC2_LOYALTY_Y_INVOICING.md)**.

---

## Paso 6 — Integrar el POS (siguiente hito de código)

- Añadir en Android la URL base del servicio (BuildConfig).
- `POST` de snapshot de venta cerrada → este API devuelve o confirma `invoice_token`.
- Ampliar el ticket térmico con QR que apunte a `PUBLIC_BASE_URL + /facturar/{token}` (cuando exista la ruta en la SPA).

---

## Estructura del proyecto

| Ruta | Uso |
|------|-----|
| `src/index.js` | Servidor Express; `/health` |
| `public/` | SPA estática (build futuro de React/Vite) |

---

## Próximos desarrollos en código

- Conexión **pg** a PostgreSQL y migraciones (esquema `invoicing`).
- Rutas `POST /internal/sales` (POS) y `GET/POST /public/invoices/:token`.
- Cliente HTTP a Facturama para timbrado CFDI 4.0.
- SPA de autoservicio en `public/` o build en CI.

---

## Documentación Facturama

Consultar en el portal de Facturama: **API Lite**, **Multiemisor**, **CFDI 4.0**, sandbox `https://apisandbox.facturama.mx`.
