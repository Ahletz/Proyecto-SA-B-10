# Manual de Usuario - Cuentas y Pagos

Esta sección explica cómo usar las funcionalidades de cuentas y pagos dentro de Bank USAC.

## 1. Mis Cuentas

Al ingresar a la sección "Mis Cuentas", el sistema muestra automáticamente todas las cuentas asociadas al cliente que inició sesión, sin necesidad de ingresar ningún identificador manualmente.

Cada cuenta muestra:
- Tipo de cuenta (Monetaria o Ahorro)
- Estado (Activa o Inactiva)
- Identificador de la cuenta

Para consultar el saldo disponible de una cuenta, se debe presionar el botón **"Ver saldo"** junto a la cuenta deseada. El saldo mostrado es el saldo disponible real (balance menos cualquier monto reservado por una transferencia en curso).

## 2. Crear Cuenta

Para abrir una nueva cuenta bancaria:

1. Seleccionar el tipo de cuenta deseado: **Monetaria** o **Ahorro**.
2. Ingresar el balance inicial.
3. Presionar **"Crear cuenta"**.

La cuenta nueva aparecerá automáticamente en la sección "Mis Cuentas" una vez creada.

### Nota sobre desactivación automática

Las cuentas se desactivan automáticamente, sin intervención del usuario, si su saldo es menor a Q50.00 y no han tenido actividad durante 6 meses consecutivos. Esta regla es aplicada por el sistema de forma periódica.

## 3. Mis Pagos

La sección "Mis Pagos" muestra el historial de pagos que el sistema ha procesado automáticamente como parte del flujo de transferencias bancarias.

Cada pago muestra:
- Identificador de la transacción asociada
- Monto
- Estado: **Aprobado** o **Rechazado** (con la razón, si fue rechazado)

Los pagos no se crean manualmente desde esta pantalla: se generan automáticamente cuando el sistema procesa una transferencia entre cuentas, como parte del flujo asíncrono entre Account Service y Payment Service.
