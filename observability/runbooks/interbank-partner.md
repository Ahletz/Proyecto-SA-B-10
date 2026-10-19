# Runbook: InterbankPartnerUnreachable

**Alerta:** más de 3 envíos interbancarios con `partner_unreachable` o `TIMEOUT` en 10 min.

## Diagnóstico
1. ¿Es el socio o somos nosotros? Comprobar `GET <baseUrl>/health` del socio y la conectividad desde el pod: `kubectl -n prod exec deploy/payment-service -- wget -qO- <baseUrl>/health`.
2. Trazas en Tempo del cliente HTTP (span hacia el socio, header `traceparent` propagado): error de red, 5xx o timeout.
3. Estado de las transferencias: las que quedan en `SENT`/`TIMEOUT` se resuelven solas por consulta `GET /transfers/{id}` tras expiresAt + 300 s; **no se reintenta el POST con otra clave**, solo con la misma `Idempotency-Key`.
4. Verificar `INTERBANK_PARTNERS` (URL y apiKey vigentes) en el Secret `bank-interbank-secret` (namespace `prod`).

## Mitigación
- Socio caído: no hacer nada manual con el dinero; el worker consulta, y si el estado no se confirma tras el margen, libera/revierte según el protocolo. Avisar al contacto del banco socio.
- Credenciales o URL incorrectas: actualizar el Secret y `rollout restart deploy/payment-service`.

## Verificación
Transferencias en `PENDING/SENT` terminan en estado final; el contador deja de crecer.

## Escalamiento
Contactar al equipo del banco socio con los `interbankTransferId` y `traceId` afectados.
