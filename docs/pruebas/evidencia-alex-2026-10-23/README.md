# Evidencia de Alex — 23 de octubre de 2026

Datos y capturas de un entorno local aislado. No contienen credenciales, sesiones de navegador ni payloads SMTP. No acreditan GKE/HPA ni operación con BANK13.

- `ciclo-vida.json`: registro/KYC, anomalía duplicada e idempotencia.
- `consulta-historica.json`: 228 eventos, búsqueda fuera del límite antiguo y filtros.
- `frontend-gateway.json` y `consulta-frontend.png`: filtro real desde frontend mediante Gateway con ADMIN.
- `entrega-alertmanager.json`: entrega real Alertmanager → Notification.
- `timeline.json`, `samples.json`, `queries-final.json`, `k6-resumen.txt`, `resumen.json`, `outcome.json`, `slo-delivery.json`: escenario de fallo documentado en el postmortem.
- `incidente-metricas.png`: gráfico generado desde las muestras reales, no valores simulados.
- `dashboard-customer-auditoria.png`, `traza-ciclo-vida.png`, `traza-ciclo-vida.json`, `navegacion-log-traza.json`: logs/Tempo y navegación comprobada.
- `verificacion-recuperacion.json`, `log-error-correlacionado.json`: prueba breve posterior de readiness y logs; sus horas difieren de la ventana principal.

El 100 % de checks k6 significa que las respuestas pertenecieron a los tipos previstos por la inyección; la disponibilidad real de la muestra fue 88/241, no 100 %.
