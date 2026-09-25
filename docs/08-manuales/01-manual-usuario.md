# 19. Manual de usuario

## URLs
### Docker Compose
- Frontend: `http://localhost:3000`
- Gateway: `http://localhost:8080`
- MailHog: `http://localhost:8025`

### Kubernetes kind
- Frontend: `http://localhost:30000`
- Gateway: `http://localhost:30080`
- MailHog: usar `kubectl port-forward -n bank-usac svc/mailhog 18025:8025` y abrir `http://localhost:18025`.

## Registro CLIENT
1. abrir `/register`;
2. ingresar email, username, contraseña, nombre, documento, evidencia fotográfica, fecha de nacimiento y dirección;
3. el sistema valida mayoría de edad y unicidad;
4. revisar MailHog;
5. abrir el enlace de activación;
6. iniciar sesión.

## Perfil
`/profile` muestra `customerId`, rol, `identityStatus`, estado y datos de identidad. Se permiten cambios de email, nombre, dirección y evidencia fotográfica.

## Cuentas
En `/accounts` crear `MONETARY` o `SAVINGS`, indicar saldo inicial y consultar saldo/disponible/estado.

## Navegación
Después de iniciar sesión, la barra superior muestra solo las opciones del rol: CLIENT ve Inicio, Perfil, Cuentas, Transferir e Historial; CASHIER agrega Pagos; ADMIN agrega Pagos, Notificaciones y Auditoría (no transfiere).

## Transferencia CLIENT
Requisito: el KYC del cliente debe estar `VERIFIED`. Mientras no lo esté, Inicio y Transferir muestran un aviso y la transferencia se rechaza con `KYC_NOT_VERIFIED`. Un ADMIN lo verifica con `PATCH /api/customers/:customerId/kyc` (ver [referencia API](02-referencia-api.md)).

1. abrir **Transferir** (`/transfer`);
2. elegir la cuenta origen de la lista (muestra el saldo disponible);
3. ingresar la cuenta destino (el campo sugiere las cuentas propias) y un monto positivo;
4. enviar: el estado se actualiza solo hasta llegar a un estado final;
5. si falla, se muestra el motivo (KYC, fondos insuficientes o rechazo del pago) y qué hacer;
6. **Ver historial de la cuenta** abre el historial filtrado por esa cuenta.

Estados mostrados: Recibida en cola → Pendiente → Procesando pago → Completada, o Fallida / Fallida · fondos devueltos (compensada). El `correlationId` queda visible para rastrear la transferencia en auditoría.

## Historial
En **Historial** (`/transactions`) el CLIENT elige una de sus cuentas; ADMIN y CASHIER escriben el `accountId` (o llegan desde **Cuentas → Ver historial**). Filtros por rango de fechas y estado (`PENDING`, `APPROVED`, `FAILED`), con paginación; las fallidas muestran el motivo.

## CASHIER
Usuario demo: `cashier`. La contraseña se suministra por configuración de ambiente de demostración. Puede trabajar con cuentas, pagos y mantenimiento autorizado.

## ADMIN
Usuario demo: `admin`. Puede consultar auditoría, pagos y mantenimiento.

Las credenciales de demostración no deben tratarse como credenciales de producción.
