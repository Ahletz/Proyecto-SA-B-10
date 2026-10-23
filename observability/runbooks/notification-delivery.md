# Entrega de notificaciones y alertas

Si una alerta Firing no aparece en auditoría, comprobar Prometheus → Alertmanager → webhook. El receptor debe tener `ALERT_WEBHOOK_TOKEN`; un token ausente devuelve 503 y uno incorrecto 401. Comparar la referencia de Secret de Notification y el archivo montado en Alertmanager, sin volcar sus valores en logs. Revisar NetworkPolicy y readiness de Notification. Un 404 puede indicar que todavía no se promovió la nueva aplicación por release/main.

Si la alerta está auditada pero no llega correo, revisar SMTP y tareas `notification_outbox` por status/kind/attempts. El consumidor de auditoría no debe bloquearse esperando SMTP. PENDING se reintenta con backoff; FAILED tras diez intentos exige corregir la causa y reprogramar solo las tareas identificadas. Conservar sus ids y no vaciar tablas ni colas completas.

Al recuperar, verificar consumer lag, eventos duplicados descartados, filas auditadas y estado outbox; probar que no aparecen tokens/emails en logs. SMTP es al menos una vez: reconocer posibles duplicados por NotificationId. Para una anomalía sin contacto proyectado se usa `NOTIFICATION_ALERT_EMAIL`; recuperar contactos por eventos, nunca leyendo la base de Customer ni llamándolo por HTTP.
