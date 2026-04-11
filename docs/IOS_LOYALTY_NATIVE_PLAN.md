# IntimoCoffee Loyalty — app iOS nativa (App Store)

Referencia técnica derivada del análisis del **Android** (`IntimoCoffeeLoyalty`) y del **backend** (`IntimoCoffeeLoyaltyServer`).

## Qué hace hoy la app Android

| Área | Detalle |
|------|---------|
| **UI** | Jetpack Compose, Material 3, splash ~1.5s |
| **Navegación** | Login → Registro; sesión → `Main` con **bottom bar**: Dashboard, Recompensas, QR, Historial, Ajustes |
| **Red** | Retrofit + OkHttp + kotlinx.serialization JSON; `baseUrl` HTTPS (`https://api.cafeintimo.mx/`) |
| **Sesión** | DataStore: `customer_id`, nombre, teléfono, `is_logged_in`, host/puerto servidor (default `api.cafeintimo.mx:443`) |
| **QR** | Endpoint `GET /loyalty/qrcode/{customerId}` → `qrData` tipo `INTIMO_LOYALTY:{id}`; generación visual con ZXing |

## Contrato REST que debe implementar iOS

Todas las respuestas siguen el envoltorio `ApiResponse<T>`: `success`, `data`, `message` (opcional).

**Base URL configurable** (igual que Android): preferencias de usuario para host + puerto.

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/loyalty/customer/register` | Body: `name`, `phone`, `password`, `email?` |
| POST | `/loyalty/customer/login` | Body: `phone`, `password` |
| GET | `/loyalty/customer/{id}` | Perfil |
| PUT | `/loyalty/customer/{id}` | Actualizar perfil (campos opcionales) |
| GET | `/loyalty/customer/{id}/points` | Puntos y tier |
| GET | `/loyalty/customer/{id}/transactions?limit&offset` | Historial |
| GET | `/loyalty/rewards` | Catálogo activo |
| GET | `/loyalty/customer/{id}/coupons` | Cupones activos (+ `qrData` por cupón) |
| POST | `/loyalty/redeem` | Body: `customerId`, `rewardId` |
| GET | `/loyalty/qrcode/{customerId}` | Datos para QR de identificación |
| GET | `/health` | Comprobación de servidor |

Modelos JSON alineados a `LoyaltyApiService.kt` (nombres de campos `camelCase` en Kotlin serialization; verificar en red que el servidor serialice igual — Ktor suele usar los mismos nombres).

## Stack iOS recomendado (100 % nativo, sin frameworks “raros”)

- **Lenguaje**: Swift 5.9+
- **UI**: **SwiftUI** (estándar Apple desde hace años; es nativo, no es React Native ni Flutter)
- **Red**: **`URLSession`** + `Codable` (o `JSONDecoder` manual). Sin Alamofire obligatorio.
- **Persistencia sesión / servidor**: **UserDefaults** o **Keychain** (token futuro) + AppStorage/UserDefaults para IP/puerto
- **QR**: **Core Image** (`CIFilter` `CIQRCodeGenerator`) o **VisionKit** solo si hace falta escaneo; para *mostrar* QR basta Core Image

**Bundle ID sugerido**: `com.intimocoffee.loyalty` (debe coincidir con App Store Connect).

## Pantallas a replicar (paridad con Android)

1. **Splash** (opcional, branding)
2. **Login** / **Registro** (teléfono + contraseña; email opcional en registro)
3. **Tab principal**  
   - Dashboard: puntos, tier, resumen  
   - Recompensas: lista + canje (`POST /loyalty/redeem`)  
   - QR: imagen desde `qrData` o endpoint QR  
   - Historial: lista de transacciones  
   - Ajustes: URL/IP + puerto del servidor, probar `/health`, cerrar sesión

## Temas de producción / App Store

- **ATS**: si el servidor es solo `http://`, añadir excepción en `Info.plist` para el dominio/IP, o preferir **HTTPS** en producción
- **Privacidad**: política de datos (teléfono, puntos) en App Store Connect
- **Iconos y capturas**: según Human Interface Guidelines

## Próximo paso de implementación

Crear proyecto Xcode **App** → iOS → SwiftUI → ciclo de vida **SwiftUI App**, módulos internos sugeridos:

- `Networking` (`LoyaltyAPIClient`)
- `Models` (`Codable` structs espejo de `LoyaltyApiService.kt`)
- `SessionStore` (`ObservableObject`)
- `Features/` por pantalla

Este documento sirve de checklist; la implementación nativa puede comenzar en un nuevo directorio p. ej. `IntimoCoffeeLoyalty-iOS/` en el monorepo o repositorio aparte.
