# Variables de entorno: CSD (Facturama API Lite)

El cuerpo JSON que usa Facturama para **Agregar CSD** se mapea así a variables de entorno:

| Campo JSON (API) | Variable de entorno |
|------------------|------------------------|
| `Rfc` | `FACTURAMA_EMISOR_RFC` |
| `Certificate` | `FACTURAMA_CSD_CERTIFICATE_BASE64` |
| `PrivateKey` | `FACTURAMA_CSD_PRIVATE_KEY_BASE64` |
| `PrivateKeyPassword` | `FACTURAMA_CSD_PRIVATE_KEY_PASSWORD` |

## Cómo rellenar `.env`

1. Copia [`.env.example`](../.env.example) a `.env`.
2. Pega los valores **como una sola línea** cada uno (los base64 no deben tener saltos de línea).
3. En sandbox puedes usar los **certificados de prueba del SAT** (mismo RFC que indique la documentación, p. ej. `EKU9003173C9`).

## Seguridad

- El archivo **`.env` está en `.gitignore`**: no lo subas a Git.
- En **EC2**, usa permisos restrictivos: `chmod 600 .env`.
- En producción, valorar **AWS Secrets Manager** o **Parameter Store** en lugar de archivo plano.

## Subir el CSD a Facturama (obligatorio para timbrar)

Tener el CSD solo en `.env` **no** basta: Facturama debe tenerlo asociado a tu cuenta. Desde la carpeta del proyecto:

```bash
npm run facturama:upload-csd
```

Ese script hace `POST /api-lite/csds` con las variables anteriores. Si Facturama responde que **ya existe un CSD** para ese RFC, el script termina con éxito (no es error): el certificado ya está en tu cuenta.

Para **sustituir** certificado/llave desde el `.env`:

```bash
npm run facturama:upload-csd -- --update
```

(`PUT /api-lite/csds/{rfc}`.)

Si no ejecutas la carga (o no cargas el CSD en el panel de Facturama), el timbrado puede responder: *No se encuentra el CSD para el Emisor con RFC: …*.

## Uso en código

Cuando implementéis la llamada `POST https://apisandbox.facturama.mx/api-lite/csds`, construid el body JSON leyendo estas variables (y las credenciales `FACTURAMA_USER` / `FACTURAMA_PASSWORD` para Basic Auth).
