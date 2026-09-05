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

## Transferencia CLIENT
1. copiar UUID de cuenta origen y destino;
2. abrir `/transfer`;
3. ingresar monto positivo;
4. enviar;
5. guardar `correlationId`;
6. consultar estado hasta terminal.

Estados: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `COMPENSATING`, `COMPENSATED`.

## CASHIER
Usuario demo: `cashier`. La contraseña se suministra por configuración de ambiente de demostración. Puede trabajar con cuentas, pagos y mantenimiento autorizado.

## ADMIN
Usuario demo: `admin`. Puede consultar auditoría, pagos y mantenimiento.

Las credenciales de demostración no deben tratarse como credenciales de producción.
