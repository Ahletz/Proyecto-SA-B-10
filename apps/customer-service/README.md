# Customer Service

Microservicio (Spring Boot, JPA) responsable de la identidad: registro, activación por correo, login con JWT, perfil y estado KYC. Publica `customer.registered`, `customer.activated`, `customer.updated` y `customer.kyc.status.changed`. Es el dueño de la base `bank_customer`.

## Endpoints

Las rutas públicas del sistema pasan por el API Gateway; aquí se muestran contra el servicio directo (`http://localhost:8081`).

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/customers/register` | público | Registra un CLIENT en `PENDING_ACTIVATION` y devuelve `activationToken` |
| GET | `/api/customers/activate/{token}` | público | Activa la cuenta (`ACTIVE`) |
| POST | `/api/customers/login` | público | Devuelve el JWT |
| GET, PUT | `/api/customers/me` | autenticado | Consulta y actualiza el perfil |
| GET | `/api/customers?kycStatus=` | ADMIN, CASHIER | Lista clientes (sin la foto del documento) |
| PATCH | `/api/customers/{customerId}/kyc` | ADMIN | Cambia el KYC a `PENDING`, `VERIFIED` o `REJECTED` |

Registro requiere `email`, `password` (mínimo 6), `fullName`, `documentNumber`, `documentPhoto`, `birthDate` (mayor de 18 años) y `address`; `username` es opcional.

## Pruebas manuales por curl

```bash
# 1) registrar
curl -s -X POST http://localhost:8081/api/customers/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","username":"demo","password":"Secret123!","fullName":"Cliente Demo","documentNumber":"1234567890101","documentPhoto":"foto","birthDate":"1990-01-01","address":"Ciudad de Guatemala"}' | jq

# 2) activar con el activationToken devuelto (también llega por correo a MailHog)
curl -i http://localhost:8081/api/customers/activate/<activationToken>

# 3) login
JWT=$(curl -s -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"Secret123!"}' | jq -r '.token')

# 4) perfil
curl -i -X PUT http://localhost:8081/api/customers/me \
  -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" \
  -d '{"address":"Nueva dirección 123"}'
```

Validaciones esperadas: login con contraseña incorrecta o cuenta sin activar -> `401`; token de activación inválido -> `400`. La cuenta debe estar activa antes de iniciar sesión.

## Eventos y KYC

Un cambio real de KYC publica `customer.kyc.status.changed` (repetir el mismo estado no publica nada) y Transaction lo proyecta en su base. Solo un cliente `VERIFIED` puede transferir. Ver [contratos de eventos](../../docs/02-eventos/01-contratos-eventos.md).

## Observabilidad

OpenTelemetry (SDK en la aplicación) con spans HTTP, de publicación y de negocio, `traceparent` en los headers AMQP y logs JSON con redacción de datos sensibles. Persiste el `correlationId` y el contexto de traza del registro (`lifecycle_*`) para enlazar la verificación KYC posterior. Métricas: `bank_customer_kyc_current`, `bank_customer_kyc_total`, `bank_customer_kyc_verification_duration_seconds`, `bank_operations_total` y las HTTP. Detalle en [Implementación de Customer y Notification](../../docs/observabilidad/alex-fase3.md). En local `OTEL_SDK_DISABLED=true` (ver `.env.example`).

## Pruebas

```bash
mvn -B clean test
```
