# Verificación aislada de Customer y Notification & Audit

Requiere Linux, Docker, Python 3 con PyYAML, Java 17 y los JAR compilados con `mvn verify` en ambos servicios. No usa bases ni credenciales productivas. El estado y secretos temporales viven en `/tmp/bankusac-alex-local` (directorio privado); puede cambiarse con `BANKUSAC_TEST_DIR` en **todos** los comandos.

```bash
python3 tests/observability/runtime.py start
python3 tests/observability/runtime.py status
python3 tests/observability/start_alerts.py
python3 tests/observability/visual_stack.py
python3 tests/observability/verify_notification_runtime.py
python3 tests/observability/verify_audit_runtime.py
python3 tests/observability/verify_alertmanager_runtime.py
```

Esperar estado UP antes de verificar. El stack visual expone direcciones/puertos en el archivo privado `runtime.json`; Grafana usa el usuario `admin` y la contraseña temporal de ese archivo. Se exporta OTLP real; Collector recolecta stdout hacia Loki, sin broker para logs. `visual_stack.py` reemplaza el Collector mínimo conservando sus puertos; iniciar una sola vez por entorno.

Para el escenario de fallo, descargar la imagen k6 fijada por digest en `k6-image.txt` y ejecutar:

```bash
docker pull "$(cat tests/observability/k6-image.txt)"
python3 tests/observability/broker_incident.py
python3 tests/observability/collect_incident.py
```

**La inyección detiene temporalmente la aplicación RabbitMQ del contenedor identificado por la etiqueta de este entorno.** El script verifica esa etiqueta, mantiene carga a un registro/s y restaura RabbitMQ en `finally`. No ejecutarlo contra otro entorno. Los checks de k6 aceptan los errores esperados del escenario: mirar `http_req_failed` y SLO, no confundir `checks=100%` con disponibilidad.

Los scripts guardan resultados reales en el directorio temporal; los resultados versionados del 23 oct están en `docs/pruebas/evidencia-alex-2026-10-23/`. La prueba no valida saldos, Saga, HPA ni GKE. SMTP es al menos una vez.

Limpieza:

```bash
python3 tests/observability/runtime.py stop
```

Se conservan los logs/evidencias locales; no versionar `runtime.json`, tokens, sesiones de navegador ni cuerpos SMTP. Los JAR en ejecución son copias inmutables para que una compilación no modifique un proceso activo.
