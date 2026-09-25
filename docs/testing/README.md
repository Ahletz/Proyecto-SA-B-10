# Evidencia de Pruebas

Este documento contiene la evidencia de ejecución de las pruebas unitarias de Account Service y Payment Service (NestJS, Vitest). Ambas suites corren en CI en cada push a `feature/*` y en cada PR hacia `develop` (`integrante2-ci.yml`).

## Account Service

13 pruebas unitarias en 2 archivos:

- `account.service.spec.ts` (10):
  - Creación de cuenta: `minBalance` 0 por defecto en `MONETARY` y 50 en `SAVINGS`, `minBalance` explícito, comisión guardada y tipo inválido rechazado.
  - Reserva de fondos (Saga): reserva monto + comisión, rechazo por fondos insuficientes (monto + comisión + saldo mínimo), cuenta origen inexistente e idempotencia.
  - Compensación: libera monto + comisión cuando Payment rechaza.
- `rabbit.service.spec.ts` (3): el proceso termina si el broker cierra la conexión o el canal, y no termina en un apagado normal.

```bash
cd apps/account-service
npm test
```

## Payment Service

9 pruebas unitarias en 2 archivos:

- `payment.service.spec.ts` (6):
  - Validaciones: monto inválido (≤ 0), monto sobre `PAYMENT_MAX_AMOUNT` e idempotencia por `transactionId`.
  - Simulación del procesador externo: aprueba con tasas en 0, `EXTERNAL_FAILURE` con tasa de fallo 1 y `TIMEOUT` con tasa de timeout 1.
- `rabbit.service.spec.ts` (3): mismo comportamiento de reconexión que Account.

```bash
cd apps/payment-service
npm test
```

## Resumen (ejecución 2026-09-24)

| Servicio | Archivos | Pruebas | Resultado |
|---|---|---|---|
| Account Service | 2 | 13 | 13 passed |
| Payment Service | 2 | 9 | 9 passed |
