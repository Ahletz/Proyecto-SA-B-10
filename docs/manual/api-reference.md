# Referencia rápida API

Base local: `http://localhost:8080`. Base kind: `http://localhost:30080`.

Los endpoints protegidos requieren `Authorization: Bearer <JWT>`.

### Transferencia
`POST /api/transfers`
```json
{"sourceAccount":"uuid","targetAccount":"uuid","amount":250}
```
Respuesta `202` lógica: `accepted`, `correlationId`, `eventId`, `status=PENDING`.

### Cuenta
`POST /api/accounts`
```json
{"type":"MONETARY","initialBalance":1500}
```
`GET /api/accounts` devuelve las cuentas del Cliente autenticado; ADMIN/CASHIER pueden usar `?customerId=CUST-X`.
