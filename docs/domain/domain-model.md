# Modelo de Dominio - Bank USAC

## Objetivo

Este documento describe las entidades principales del negocio bancario relacionadas con Account Service y Payment Service, sus atributos y responsabilidades dentro del sistema.

## Cuenta (Account)

**Responsabilidad:** representa una cuenta bancaria perteneciente a un cliente. Es responsable de mantener el saldo disponible, gestionar la reserva temporal de fondos durante una transferencia, y aplicar la regla de negocio de desactivación automática por inactividad.

**Atributos principales:**
- Identificador único de la cuenta
- Cliente al que pertenece
- Tipo de cuenta (monetaria o ahorro)
- Saldo actual
- Monto reservado (fondos apartados temporalmente durante una transferencia en curso)
- Estado (activa/inactiva)
- Fecha de última actividad

**Reglas de negocio:**
- El saldo disponible real es el saldo actual menos el monto reservado.
- Una cuenta se desactiva automáticamente si su saldo es menor a Q50 y no ha tenido actividad en 6 meses.
- Los fondos se reservan antes de aplicar una transferencia, y se liberan si la operación falla (compensación de la Saga).

## Pago (Payment)

**Responsabilidad:** representa la validación y procesamiento de una operación financiera asociada a una transacción. Determina si una operación puede aprobarse o debe rechazarse.

**Atributos principales:**
- Identificador único del pago
- Transacción asociada
- Monto de la operación
- Estado (aprobado/rechazado)
- Razón de rechazo, si aplica

**Reglas de negocio:**
- Un pago se rechaza si el monto no es válido (menor o igual a cero).
- El resultado del pago (aprobado o rechazado) determina si Account Service aplica la transferencia o libera los fondos reservados.

## Diagrama Entidad-Relación

Cada microservicio posee su propia base de datos independiente, sin relaciones de clave foránea entre ellas (regla obligatoria del enunciado: "database per service"). Por eso cada entidad corresponde a una tabla de un microservicio distinto:

- **ACCOUNT** → tabla `accounts`, base de datos `bank_account` (Account Service)
- **PAYMENT** → tabla `payments`, base de datos `bank_payment` (Payment Service)
- **TRANSACTION** → tabla `transactions`, base de datos `bank_transaction` (Transaction Service)
- **CUSTOMERS** → tabla `customers`, base de datos `bank_customer` (Customer Service)
- **PROCESSED_EVENTS** → tabla `processed_events`, base de datos `bank_notification` (Notification & Audit Service)

Por simplicidad visual, los 5 diagramas ER (uno por microservicio) se presentan juntos en una sola imagen, sin ninguna línea de relación entre ellos, reflejando que cada base de datos es completamente independiente:

![Diagrama ER completo](../uml/er_diagrama_completo.png)