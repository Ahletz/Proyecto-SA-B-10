# API Gateway

El Gateway es el **único punto de entrada externo** del backend. No contiene lógica bancaria ni coordina la Saga.

Funciones permitidas:
- validar JWT y roles;
- generar `correlationId` para comandos de transferencia;
- publicar eventos de entrada en RabbitMQ;
- enrutar operaciones HTTP de entrada hacia el bounded context propietario;
- bloquear acceso directo desde el frontend a servicios internos.

No realiza:
- validación de fondos;
- débito/crédito;
- procesamiento de pagos;
- persistencia bancaria;
- orquestación de pasos de Saga.

### Endpoints principales

| Método | Ruta | Rol |
|---|---|---|
| POST | `/api/customers/register` | público |
| GET | `/api/customers/activate/:token` | público |
| POST | `/api/customers/login` | público |
| GET/PUT | `/api/customers/me` | autenticado |
| POST/GET | `/api/accounts` | autenticado |
| POST | `/api/transfers` | autenticado |
| GET | `/api/transfers/:correlationId` | autenticado |
| GET | `/api/payments` | ADMIN/CASHIER |
| GET | `/api/audit/events` | ADMIN |
