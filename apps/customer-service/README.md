# Customer Service - pruebas por curl

Estas pruebas asumen que la infraestructura ya está levantada con Docker Compose y que el servicio de Customer Service está corriendo.

## 1) Registrar un cliente

```bash
curl -s -X POST http://localhost:8081/api/customers/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user1@example.com",
    "username": "user1",
    "password": "Secret123!"
  }' | jq
```

Resultado esperado:
- HTTP 200
- JSON con `status`, `customerId` y `activationToken`

## 2) Activar la cuenta con el token devuelto

```bash
TOKEN=$(curl -s -X POST http://localhost:8081/api/customers/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user2@example.com",
    "username": "user2",
    "password": "Secret123!"
  }' | jq -r '.activationToken')

curl -i -X POST "http://localhost:8081/api/customers/activate/$TOKEN"
```

Resultado esperado:
- HTTP 200
- la cuenta queda en estado `ACTIVE`

## 3) Login para obtener el JWT

```bash
curl -s -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user1",
    "password": "Secret123!"
  }' | jq
```

Resultado esperado:
- HTTP 200
- JSON con `token`

Guardar el token para la siguiente prueba:

```bash
JWT=$(curl -s -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user1",
    "password": "Secret123!"
  }' | jq -r '.token')
```

## 4) Actualizar perfil autenticado

```bash
curl -i -X PUT http://localhost:8081/api/customers/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "email": "user1.updated@example.com"
  }'
```

Resultado esperado:
- HTTP 200
- JSON con `status: ok`, `customerId` y `updatedFields`

## 5) Validaciones negativas recomendadas

### Login con contraseña incorrecta

```bash
curl -i -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user1",
    "password": "wrong-pass"
  }'
```

Debe responder con HTTP 401.

### Activación con token inválido

```bash
curl -i -X POST http://localhost:8081/api/customers/activate/invalid-token
```

Debe responder con HTTP 400.

## 6) Secuencia válida recomendada para pruebas manuales

```bash
# 1) registrar
curl -s -X POST http://localhost:8081/api/customers/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","username":"demo","password":"Secret123!"}' | jq

# 2) copiar activationToken desde la respuesta y activar
curl -i -X POST http://localhost:8081/api/customers/activate/<activationToken>

# 3) login
curl -s -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"Secret123!"}' | jq

# 4) actualizar perfil
JWT=$(curl -s -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"Secret123!"}' | jq -r '.token')

curl -i -X PUT http://localhost:8081/api/customers/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"username":"demo2"}'
```

> Importante: la cuenta debe estar activa antes de poder hacer login. El registro devuelve un `activationToken` temporal y el flujo correcto es: registrar → activar → login → actualizar perfil autenticado.
