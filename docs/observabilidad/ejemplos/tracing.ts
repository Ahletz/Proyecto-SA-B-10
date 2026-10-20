// Ejemplo para servicios NestJS (Account, Payment, Transaction, Gateway).
// Copiar a src/tracing.ts de cada servicio e importarlo en la PRIMERA línea de main.ts:
//
//   import './tracing';
//
// Dependencias a instalar en cada servicio:
//   @opentelemetry/api
//   @opentelemetry/sdk-node
//   @opentelemetry/sdk-metrics
//   @opentelemetry/auto-instrumentations-node
//   @opentelemetry/exporter-trace-otlp-http
//   @opentelemetry/exporter-metrics-otlp-http
//
// El nombre del servicio, el endpoint del Collector y el ambiente se leen de las
// variables OTEL_* definidas en docs/observabilidad/convenciones.md.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

if (process.env.OTEL_SDK_DISABLED !== 'true') {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
