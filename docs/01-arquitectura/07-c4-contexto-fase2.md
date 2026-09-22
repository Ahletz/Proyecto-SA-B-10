# 7. C4 Nivel 1 — Contexto Fase 2

## Propósito

El diagrama de contexto representa a Bank USAC como el sistema bancario utilizado por clientes, cajeros y administradores. El API Gateway se mantiene como punto único de entrada para las solicitudes de usuario.

La Fase 2 conserva la arquitectura desacoplada de la Fase 1 y agrega capacidades de gestión KYC, tipos de cuenta, historial de transacciones, simulación de pagos externos y clasificación extendida de eventos.

## Actores

### Cliente

El cliente utiliza Bank USAC para:

- administrar su perfil;
- consultar el estado KYC;
- consultar sus cuentas;
- solicitar transferencias;
- consultar operaciones disponibles para su rol.

Solo los clientes cuyo estado KYC es `VERIFIED` pueden participar en una transferencia válida.

### Cajero

El cajero accede a funciones operativas autorizadas, incluyendo operaciones relacionadas con cuentas y pagos.

### Administrador

El administrador dispone de funciones de supervisión, actualización del estado KYC y consulta del historial de auditoría y notificaciones clasificadas.

## Sistemas externos

### Sistema externo de pagos

Payment Service simula la interacción con un proveedor externo. La respuesta puede ser:

- `SUCCESS`;
- `FAILURE`;
- `TIMEOUT`.

La integración se representa como externa aunque en el entorno académico la respuesta sea simulada.

### Servicio de correo

Notification & Audit utiliza un servicio SMTP para correos de activación y otras notificaciones. En el entorno local se utiliza MailHog.

## Límite del sistema

En este nivel Bank USAC se representa como un único sistema. El API Gateway, los cinco microservicios, RabbitMQ y sus bases de datos son detalles internos que se muestran en el C4 Nivel 2.

El API Gateway continúa siendo el punto único de entrada HTTP. Entre los microservicios de negocio no se utiliza comunicación HTTP directa: la coordinación distribuida se realiza mediante eventos.

## Diagrama

![C4 Nivel 1 — Contexto](../assets/diagramas/c4-context.png)

## Cambios respecto de Fase 1

La Fase 2 incorpora al contexto:

- estado KYC `PENDING`, `VERIFIED` y `REJECTED`;
- validación KYC previa a transferencias;
- simulación de proveedor externo de pagos;
- notificaciones clasificadas como `INFO`, `WARNING` y `ERROR`;
- mayor trazabilidad mediante `eventId` y `correlationId`.
