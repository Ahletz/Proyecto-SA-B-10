# Manual de usuario

## Registro y activación
Abra `/register` y complete identidad. El registro público siempre crea un usuario con rol `CLIENT`. El sistema genera/acepta username, crea el cliente `PENDING_ACTIVATION` y Notification envía un correo a MailHog. Abra `http://localhost:8025`, copie el enlace y active.

## Cliente
Inicie sesión, abra **Cuentas**, cree dos cuentas y revise saldos. En **Transferir**, copie los UUID de cuenta, indique monto y envíe. Use **Consultar estado** hasta `COMPLETED`.

## Cajero receptor
Use el usuario de demostración `cashier` / `Cashier123!`. Puede consultar/crear cuentas para un `customerId`, revisar pagos y ejecutar mantenimiento de cuentas inactivas.

## Administrador
Use el usuario de demostración `admin` / `Admin123!`. Puede revisar **Auditoría**, pagos y mantenimiento.

## Estados de transferencia
- `PENDING`: aceptada y persistida;
- `PROCESSING`: fondos reservados;
- `COMPLETED`: débito/crédito aplicado;
- `FAILED`: rechazo previo a reserva o fallo no compensable;
- `COMPENSATING`: reversión en curso;
- `COMPENSATED`: reserva liberada tras fallo.
