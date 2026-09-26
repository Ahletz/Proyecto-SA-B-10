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
2. llenar nombre completo, correo, usuario, contraseña (y su confirmación), número de documento, fecha de nacimiento y dirección. La foto del documento es opcional por ahora;
3. el **usuario** solo admite minúsculas, números, punto, guion o guion bajo (3 a 50, sin espacios); es el que se usa para iniciar sesión, no el correo;
4. el formulario no se envía mientras falte un campo o haya un error: cada error aparece debajo de su campo (usuario con mayúsculas, contraseñas distintas, menor de 18 años, documento con formato inválido, etc.). El backend valida además que correo, usuario y documento no estén registrados;
5. al registrarse se muestra el usuario creado y el botón **Activar ahora** (lleva a `/activate` con el token cargado). En desarrollo también llega el correo a MailHog;
6. iniciar sesión con el usuario y la contraseña.

## Perfil
`/profile` muestra `customerId`, rol, `identityStatus`, estado y datos de identidad. Se permiten cambios de email, nombre, dirección y evidencia fotográfica.

## Cuentas
En **Cuentas** (`/accounts`) se ve un resumen (saldo total, disponible y cuentas activas) y la tabla de cuentas con saldo, reservado, disponible, saldo mínimo, comisión y estado. Cada ID se muestra acortado con un botón para **copiar** el ID completo (sirve para compartirlo con quien te va a transferir). Para abrir una cuenta: elegir tipo (monetaria o ahorro), saldo inicial y, opcionalmente, saldo mínimo y comisión, y presionar **Crear cuenta**. CASHIER y ADMIN primero eligen el **cliente** de una lista.

## Navegación
Después de iniciar sesión, la barra superior muestra solo las opciones del rol: CLIENT ve Inicio, Perfil, Cuentas, Transferir e Historial; CASHIER agrega Pagos; ADMIN agrega Pagos, Clientes, Notificaciones y Auditoría (no transfiere).

## Transferencia CLIENT
Requisito: el KYC del cliente debe estar `VERIFIED`. Mientras no lo esté, Inicio y Transferir muestran un aviso y la transferencia se rechaza con `KYC_NOT_VERIFIED`. Un ADMIN lo verifica en **Clientes** (ver [ADMIN](#admin)).

1. abrir **Transferir** (`/transfer`);
2. elegir la cuenta origen de la lista (muestra el saldo disponible);
3. elegir el destino: **Otra de mis cuentas** (se escoge de una lista) o **Cuenta de otra persona** (se pega el ID que esa persona copió desde su página de Cuentas), e ingresar un monto positivo;
4. enviar: el estado se actualiza solo hasta llegar a un estado final;
5. si falla, se muestra el motivo (KYC, fondos insuficientes o rechazo del pago) y qué hacer;
6. **Ver historial de la cuenta** abre el historial filtrado por esa cuenta.

Estados mostrados: Recibida en cola → Pendiente → Procesando pago → Completada, o Fallida / Fallida · fondos devueltos (compensada). El código de seguimiento (`correlationId`) queda visible, con botón para copiarlo, para rastrear la transferencia en auditoría. Desde **Cuentas → Transferir** la cuenta origen llega ya seleccionada.

## Historial
En **Historial** (`/transactions`) el CLIENT elige una de sus cuentas; ADMIN y CASHIER eligen el cliente y luego una de sus cuentas, de listas (o llegan desde **Cuentas → Historial**). Filtros por rango de fechas y estado (`PENDING`, `APPROVED`, `FAILED`), con paginación; las fallidas muestran el motivo.

## CASHIER
Usuario demo: `cashier`. La contraseña se suministra por configuración de ambiente de demostración. Puede trabajar con cuentas, pagos y mantenimiento autorizado. En **Pagos** filtra por aprobados o rechazados, con paginación.

## ADMIN
Usuario demo: `admin`. Puede consultar auditoría, pagos y mantenimiento.

En **Auditoría** busca por tipo de evento, origen o código de seguimiento (la lupa junto a cada código muestra todos los eventos de ese flujo); **Notificaciones** y **Pagos** se paginan de 20 en 20.

En **Clientes** (`/customers`) revisa el KYC: la lista abre filtrada en *Pendiente* y cada fila tiene **Verificar** y **Rechazar**. El cambio publica `customer.kyc.status.changed`; en unos segundos Transaction actualiza su proyección y el cliente verificado ya puede transferir.

Las credenciales de demostración no deben tratarse como credenciales de producción.
