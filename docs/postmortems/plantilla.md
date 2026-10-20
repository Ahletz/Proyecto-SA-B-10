# Postmortem: <título del escenario>

- **Fecha y hora (UTC):** inicio / fin / duración
- **Autor:** 
- **Severidad:** (alta / media / baja) y por qué
- **Servicios afectados:** 

## Resumen
Dos o tres frases: qué pasó y cuál fue el impacto.

## Cronología (UTC)
| Hora | Evento |
|---|---|
| hh:mm | Inicio de carga (línea base) |
| hh:mm | Inyección del fallo (comando exacto) |
| hh:mm | Primera señal en métricas |
| hh:mm | Alerta `...` en Pending / Firing |
| hh:mm | Mitigación / recuperación |
| hh:mm | Métricas normales |

## Impacto
- Peticiones totales / con error técnico en la ventana: 
- Tasa de error máxima: 
- Burn rate máximo (1 h): 
- Presupuesto de error consumido (% del mensual): 
- Latencia p95 máxima: 
- Datos o dinero afectados (esperado: ninguno): 

## Detección
Qué alerta saltó, cuánto tardó desde la inyección y si fue suficiente. Link o captura de la alerta y del dashboard.

## Evidencia
- Captura del dashboard SLO
- `traceId` de una traza fallida (Tempo) y captura
- Consulta de Loki usada y líneas relevantes (con datos enmascarados)

## Causa raíz
Qué lo provocó técnicamente (en el escenario, la inyección), y por qué el sistema reaccionó así.

## Qué funcionó / qué no
- Funcionó: 
- No funcionó o fue lento: 

## Acciones
| Acción | Responsable | Fecha |
|---|---|---|
