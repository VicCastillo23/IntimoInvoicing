# Envío de CFDI por correo con Gmail (SMTP)

El servidor usa **nodemailer** con variables `SMTP_*`. Para que no aparezca *«configura SMTP (SMTP_HOST, SMTP_FROM)»*, deben existir al menos **`SMTP_HOST`** y **`SMTP_FROM`** (sin comillas raras, sin espacios al inicio/fin).

## Cuenta de facturación Íntimo Café

El remitente configurado en el proyecto es **`cafeintimo0@gmail.com`**. Debe coincidir **`SMTP_USER`**, **`SMTP_FROM`** y la cuenta con la que generas la **contraseña de aplicación** (Gmail no permite enviar como otro `@gmail.com` sin configuración avanzada).

En tu `.env` (servidor local o EC2):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false

SMTP_USER=cafeintimo0@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx

SMTP_FROM=cafeintimo0@gmail.com
SMTP_FROM_NAME=Íntimo Café
```

## Valores típicos para otra cuenta Gmail

Si usas otra cuenta, sustituye el correo en las tres claves anteriores (`SMTP_USER`, `SMTP_PASS` asociada a esa cuenta, `SMTP_FROM`).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false

SMTP_USER=tu_correo@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx

SMTP_FROM=tu_correo@gmail.com
SMTP_FROM_NAME=Íntimo Café
```

- **`SMTP_PASS`**: no uses la contraseña normal de la cuenta si tienes verificación en dos pasos. Crea una **contraseña de aplicación**: [Google Account](https://myaccount.google.com/) → Seguridad → Verificación en 2 pasos (activada) → **Contraseñas de aplicaciones** → generar una para “Correo” / “Otro”. Son 16 caracteres (puedes pegarla con o sin espacios).

- Tras editar `.env`, **reinicia** el proceso Node (`npm run dev` o el servicio en el servidor) para que cargue las variables.

- Comprueba en [http://localhost:3000/health](http://localhost:3000/health) que `smtpConfigured` sea `true`.

- Prueba de envío (opcional), con `SMTP_PASS` ya rellenada:

  ```bash
  cd IntimoInvoicing
  npm run smtp:ping
  ```

  Escribe un correo opcional: `npm run smtp:ping -- otro@correo.com`. Por defecto envía a `cafeintimo0@gmail.com` (misma bandeja para verificar).

## Errores frecuentes

| Síntoma | Qué revisar |
|--------|--------------|
| Sigue diciendo que falta SMTP | `SMTP_HOST` y `SMTP_FROM` definidos y sin `#` al inicio de la línea |
| `Invalid login` / `535` | Contraseña de aplicación, no la contraseña web; 2FA activo |
| `From` rechazado | `SMTP_FROM` igual a `SMTP_USER` (mismo `@gmail.com`) |
| Correo en spam | Normal al principio; más adelante conviene dominio propio y SPF/DKIM |
