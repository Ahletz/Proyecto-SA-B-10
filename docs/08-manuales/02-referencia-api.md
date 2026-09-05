# 20. Referencia API del Gateway

Base Docker: `http://localhost:8080`  
Base kind: `http://localhost:30080`

Los endpoints protegidos requieren `Authorization: Bearer <JWT>`.

## Customer
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/customers/register` | público | registrar CLIENT |
| POST | `/api/customers/login` | público | obtener JWT |
| GET | `/api/customers/activate/:token` | público | activar cliente |
| GET | `/api/customers/me` | autenticado | consultar perfil |
| PUT | `/api/customers/me` | autenticado | actualizar perfil |

## Accounts
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/accounts` | autenticado | crear cuenta; CLIENT queda forzado a su customerId |
| GET | `/api/accounts` | autenticado | listar cuentas; CLIENT solo propias |
| GET | `/api/accounts/:id` | autenticado | consultar cuenta; CLIENT valida ownership |
| POST | `/api/accounts/maintenance/deactivate-inactive` | ADMIN/CASHIER | mantenimiento |

Ejemplo:
```json
{"type":"MONETARY","initialBalance":1500}
```

## Transfers
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/transfers` | CLIENT | aceptar transferencia y publicar comando |
| GET | `/api/transfers/:correlationId` | autenticado | consultar estado |

Request:
```json
{"sourceAccount":"uuid","targetAccount":"uuid","amount":250}
```

Respuesta de aceptación:
```json
{"accepted":true,"correlationId":"uuid","eventId":"uuid","status":"PENDING"}
```

## Administración
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/audit/events` | ADMIN |
| GET | `/api/payments` | ADMIN/CASHIER |
| GET | `/api/payments/transaction/:id` | ADMIN/CASHIER |

## Health
- `GET /health`
- `GET /health/ready`
