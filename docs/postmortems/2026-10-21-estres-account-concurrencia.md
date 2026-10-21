# Postmortem: actualizaciones concurrentes y conexiones agotadas en Account durante la prueba de estrés

- **Fecha y hora (UTC):** 21 oct 2026, de 05:41:01 a 10:44:39. Impacto de usuario de 05:41 a 05:49 (errores 500) y cola de Sagas sin terminar hasta la corrección. Duración total: 5 h 3 min.
- **Autor:** Nufio (Integrante 3)
- **Severidad:** alta. Hubo errores visibles para el cliente (25 % de las peticiones del Gateway fallaron) y Sagas detenidas con fondos reservados. En la reproducción se demostró que el código podía perder actualizaciones de saldo.
- **Servicios afectados:** Account Service, y por arrastre el API Gateway, Transaction Service y las bases Cloud SQL `db-f1-micro`.

## Resumen
La prueba de estrés con k6 (hasta 25 transferencias/s) encontró dos defectos reales que no aparecían con carga nominal:
1. **Account** aplicaba reserva, confirmación y liberación de fondos leyendo el saldo, calculándolo en memoria y guardándolo **sin transacción ni bloqueo de fila**. Con varias réplicas consumiendo en paralelo, Postgres abortó transacciones por **deadlock** (`40P01`) y los eventos agotaron sus reintentos y terminaron en la DLQ. Las Sagas quedaron detenidas con fondos reservados.
2. El **HPA** escaló Account y Transaction a 5 réplicas, cada una con un pool de 10 conexiones. Eso suma unas 50 conexiones contra una instancia que admite unas 25, y Postgres respondió `too many clients`. El Gateway devolvió 500.

Se mitigó bajando el máximo del HPA a 2 réplicas, se corrigió en `v0.5.3` (PR #51) y se reprocesó la DLQ. El total de las cuentas de prueba quedó cuadrado (Q5085) y sin reservas pendientes.

## Cronología (UTC)
| Hora | Evento |
|---|---|
| 05:41:01 | Inicio de k6 perfil `stress` (5 → 15 → 25 transferencias/s) contra `https://35-244-157-47.sslip.io` |
| ~05:43 | Primera señal: el error técnico de Account sube y la cola `account-service.events` empieza a crecer; el HPA escala Account y Transaction |
| 05:44:00 | `SloBurnRateFast` (account-service) en **Pending** |
| 05:45:00 | `HighLatencyP95` (account-service) en **Pending** |
| 05:46:00 | `SloBurnRateFast` en **Firing**, 5 min después del inicio de la carga |
| 05:47:25 | Fin de k6. Gateway con 75 % de disponibilidad, cola de Account con 1696 mensajes y DLQ con unos 460 |
| 05:49:26 | **Mitigación:** `kubectl -n prod patch hpa account-service` y `transaction-service` con `maxReplicas: 2`. Terminan los `too many clients`, pero los deadlocks siguen y la DLQ sigue creciendo |
| 05:55:00 | `HighLatencyP95` en **Firing** |
| 06:27:00 | Se resuelven `SloBurnRateFast` y `HighLatencyP95` |
| ~06:00–10:00 | Reproducción y corrección en local contra Postgres 17 (200 transferencias concurrentes); PR #51 con CI en verde |
| 10:28 | **Corrección desplegada:** release `v0.5.3` (PR #52) por `cd-prod`. El HPA vuelve a `maxReplicas: 5`, ahora con pool de 4 |
| 10:43:41 | DLQ de Account (1294 mensajes) reprocesada con un shovel de RabbitMQ hacia `account-service.events` |
| 10:44:39 | Cola y DLQ en 0. Reservas pendientes en 0 y total de las cuentas de prueba en Q5085 |

## Impacto
- **Peticiones (ventana de k6, 6 min 24 s):** 12 076 peticiones HTTP, 3127 fallidas (25,9 %), todas con `500` del Gateway. Transferencias aceptadas: 2706 de 3855.
- **Tasa de error técnico máxima:** 86 % en Account (ventana de 5 min). Payment y Transaction sin error técnico propio.
- **Burn rate máximo (1 h):** 567× en Account (56,7 % de error técnico contra un presupuesto de 0,1 %).
- **Presupuesto de error consumido:** agotado. Entre 05:41 y 10:28 Account registró 4815 operaciones con `technical_error` contra 3673 exitosas. Con el SLO de 99,9 % a 30 días, el presupuesto es del 0,1 % de las operaciones del mes. Aunque el tráfico del mes fuera 100 veces el de la prueba, esas 4815 fallas lo superan.
- **Latencia:** el p95 de creación en el Gateway fue de 3,63 s. El p95 de la Saga de punta a punta fue de 72 s y el p99 de 208 s, por las Sagas retenidas en la cola.
- **Datos o dinero:** durante el incidente el total de las cuentas de prueba bajó a Q5078 (Q7 en tránsito) y quedaron Q162 reservados en Sagas detenidas. Tras la corrección y el reprocesamiento, el total volvió a Q5085 con Q0 reservados: **no quedó dinero perdido en prod**. En la reproducción local, el código anterior sí perdió actualizaciones: el total terminó en Q10 001 en vez de Q10 000, con 174 deadlocks.

## Detección
- `SloBurnRateFast` detectó el problema en Account: Pending a los 3 min del inicio de la carga y Firing a los 5 min. `HighLatencyP95` lo confirmó después.
- El dashboard *Bank USAC - Infraestructura, HPA y broker* mostró el HPA en 5 réplicas y el consumer lag de `account-service.events` y de su DLQ. Eso llevó a la segunda causa (conexiones).
- **Brecha:** los logs de reintento de Account no incluían el mensaje del error de Postgres. El deadlock se confirmó reproduciéndolo en local, no desde Loki.

## Evidencia
- Salida de k6: `checks 70,19 %`, `http_req_failed 25,89 %`, p95 de `create_transfer` de 3,63 s.
- Prometheus:
  - `bank:error_ratio:rate5m{service_name="account-service"}`, con un máximo de 0,864;
  - `kube_horizontalpodautoscaler_status_current_replicas`, con un máximo de 5;
  - `rabbitmq_detailed_queue_messages_ready{queue=~"account-service.*"}`, con un máximo de 1696 en la cola y 1294 en la DLQ.
- Capturas pendientes de Grafana para la ventana 05:40–06:30: dashboards *Bank USAC - SLO Account y Payment* y *Bank USAC - Infraestructura, HPA y broker*.
- Loki: `{service_name="account-service"} |= "retry"` en la ventana muestra los reintentos y el envío a la DLQ. `{service_name=~"account-service|transaction-service"} |= "too many clients"` muestra el agotamiento de conexiones.
- Reproducción (PR #51): 200 transferencias concurrentes A↔B contra Postgres 17.

  | Código | Total final | Deadlocks | Sagas completas |
  |---|---|---|---|
  | Anterior | Q10 001 | 174 | 26/200 |
  | Corregido | Q10 000 | 0 | 200/200 |

## Causa raíz
1. **Sin control de concurrencia en Account** (`account.service.ts`). `reserve`, `complete` y `release` hacían `findOneBy` → cálculo → `save` en transacciones separadas.
   - Dos mensajes sobre la misma cuenta, procesados por réplicas distintas, leían el mismo saldo y uno pisaba al otro (*lost update*).
   - Con transferencias en sentidos opuestos (A→B y B→A), las escrituras tomaban las filas en orden distinto y Postgres abortaba una por deadlock.
   - El reintento no lo resolvía con carga sostenida, así que el mensaje terminaba en la DLQ y la Saga quedaba a medias.
   - Con carga nominal (5/s) la probabilidad de choque era baja; por eso no apareció antes.
2. **Pool de conexiones sin acotar frente al HPA.** El pool por defecto (10 en TypeORM y Hikari) por el máximo del HPA (5) da 50 conexiones, más del doble de lo que admite `db-f1-micro`. El límite del HPA y el tamaño de la base se habían definido por separado.

## Qué funcionó / qué no
- **Funcionó:**
  - las alertas de burn rate y de latencia saltaron en minutos;
  - la DLQ retuvo los eventos en vez de perderlos;
  - la idempotencia por `processed_events` permitió reprocesar los 1294 mensajes sin duplicar movimientos;
  - los dashboards de HPA y consumer lag apuntaron a las dos causas.
- **No funcionó o fue lento:**
  - la mitigación con el HPA solo quitó una de las dos causas; los deadlocks siguieron hasta desplegar la corrección (unas 4,5 h);
  - los logs de reintento no traían el error;
  - el saldo de prueba quedó inconsistente mientras las Sagas estaban detenidas.

## Acciones
| Acción | Responsable | Fecha |
|---|---|---|
| Reserva, confirmación y liberación en una transacción con `SELECT … FOR UPDATE` y bloqueo en orden de `accountId` (PR #51) | Nufio | 21 oct (hecho, `v0.5.3`) |
| Pool de 4 conexiones por réplica en los 5 servicios (`DB_POOL_MAX`, Hikari `maximumPoolSize`), de modo que réplicas máximas × pool ≤ conexiones de la base (PR #51) | Nufio | 21 oct (hecho, `v0.5.3`) |
| Reprocesar la DLQ de Account y verificar saldos | Nufio | 21 oct (hecho) |
| Incluir `error.message` y `code` en los logs de reintento y de envío a la DLQ de Account | Ale (I1, dueña de Account) | 23 oct |
| Volver a correr el perfil `stress` con `v0.5.3` para confirmar la corrección con carga real | Nufio | 22 oct |
| Documentar la regla réplicas máximas del HPA × pool ≤ `max_connections` de la base en el runbook de despliegue | Nufio | 23 oct |
