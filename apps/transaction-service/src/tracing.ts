// Instrumentación OpenTelemetry. Debe ser el PRIMER import de main.ts.
// Convenciones: docs/observabilidad/convenciones.md
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const SERVICE_NAME = 'transaction-service';

// OTEL_SDK_DISABLED=true se usa solo en docker-compose local (no hay Collector).
if (process.env.OTEL_SDK_DISABLED !== 'true') {
  process.env.OTEL_SERVICE_NAME ??= SERVICE_NAME;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= 'http://otel-collector.observability.svc.cluster.local:4318';
  // Métricas HTTP estables: http_server_request_duration_seconds con http_response_status_code.
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';
  process.env.OTEL_RESOURCE_ATTRIBUTES ??=
    `deployment.environment=${process.env.DEPLOY_ENV ?? 'dev'},service.version=${process.env.APP_VERSION ?? 'unknown'}`;

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // Los spans de RabbitMQ y la propagación de traceparent se hacen a mano en
        // common/telemetry.ts (publish/process), para controlar nombres y atributos.
        '@opentelemetry/instrumentation-amqplib': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
