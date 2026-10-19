import { context, metrics, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

// Nombres y etiquetas según docs/observabilidad/convenciones.md.
const tracer = trace.getTracer('bank-usac');
const meter = metrics.getMeter('bank-usac');

export type Outcome = 'success' | 'business_rejection' | 'technical_error';

// bank.operations -> bank_operations_total en Prometheus (el exportador agrega _total).
const operations = meter.createCounter('bank.operations', {
  description: 'Operaciones de negocio por resultado',
});
// bank.operation.duration (s) -> bank_operation_duration_seconds_*; incluye el bucket de 5 s del SLO.
const operationDuration = meter.createHistogram('bank.operation.duration', {
  description: 'Duración de operaciones de negocio',
  unit: 's',
  advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
});
const eventsProcessed = meter.createCounter('bank.events.processed', {
  description: 'Eventos consumidos por resultado',
});
const eventsDuplicate = meter.createCounter('bank.events.duplicate', {
  description: 'Eventos descartados por idempotencia (ya procesados)',
});

export function recordOperation(operation: string, outcome: Outcome, seconds: number) {
  operations.add(1, { operation, outcome });
  operationDuration.record(seconds, { operation });
}

export function recordDuplicateEvent(eventType: string) {
  eventsDuplicate.add(1, { event_type: eventType });
}

// Mide una operación de negocio. `classify` decide si un resultado normal fue un rechazo
// de negocio (p. ej. fondos insuficientes) y no una falla técnica; una excepción es technical_error.
export async function timed<T>(
  operation: string,
  fn: () => Promise<T>,
  classify: (result: T) => Outcome = () => 'success',
): Promise<T> {
  const start = process.hrtime.bigint();
  const span = tracer.startSpan(operation);
  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    const outcome = classify(result);
    span.setAttribute('bank.operation.outcome', outcome);
    recordOperation(operation, outcome, Number(process.hrtime.bigint() - start) / 1e9);
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
    span.setAttribute('bank.operation.outcome', 'technical_error');
    recordOperation(operation, 'technical_error', Number(process.hrtime.bigint() - start) / 1e9);
    throw error;
  } finally {
    span.end();
  }
}

// Publicación: span "publish <routingKey>" (PRODUCER) y traceparent en los headers del mensaje.
export function withProducerSpan<T>(
  routingKey: string,
  correlationId: string | undefined,
  fn: (headers: Record<string, unknown>) => T,
): T {
  const span = tracer.startSpan(`publish ${routingKey}`, {
    kind: SpanKind.PRODUCER,
    attributes: {
      'messaging.system': 'rabbitmq',
      'messaging.operation.type': 'publish',
      'messaging.destination.name': 'bank.events',
      'messaging.rabbitmq.destination.routing_key': routingKey,
      ...(correlationId ? { 'bank.correlation_id': correlationId } : {}),
    },
  });
  try {
    const headers: Record<string, unknown> = {};
    propagation.inject(trace.setSpan(context.active(), span), headers);
    return fn(headers);
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
    throw error;
  } finally {
    span.end();
  }
}

interface IncomingMessage {
  fields: { routingKey: string };
  properties: { headers?: Record<string, unknown>; messageId?: string; correlationId?: string };
}

// Consumo: span "process <routingKey>" (CONSUMER) hijo del PRODUCER vía traceparent.
// Una excepción marca el span en error y cuenta como technical_error; se vuelve a lanzar
// para que el RabbitService aplique reintento/DLQ.
export async function withConsumerSpan<T>(message: IncomingMessage, fn: () => Promise<T>): Promise<T> {
  const routingKey = message.fields.routingKey;
  const parent = propagation.extract(ROOT_CONTEXT, message.properties.headers ?? {});
  const span = tracer.startSpan(
    `process ${routingKey}`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': 'rabbitmq',
        'messaging.operation.type': 'process',
        'messaging.destination.name': 'bank.events',
        'messaging.rabbitmq.destination.routing_key': routingKey,
        ...(message.properties.messageId ? { 'messaging.message.id': message.properties.messageId } : {}),
        ...(message.properties.correlationId ? { 'bank.correlation_id': message.properties.correlationId } : {}),
      },
    },
    parent,
  );
  const start = process.hrtime.bigint();
  const done = (outcome: Outcome) => {
    eventsProcessed.add(1, { event_type: routingKey, outcome });
    operationDuration.record(Number(process.hrtime.bigint() - start) / 1e9, { operation: `consume ${routingKey}` });
  };
  try {
    const result = await context.with(trace.setSpan(parent, span), fn);
    done('success');
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
    done('technical_error');
    throw error;
  } finally {
    span.end();
  }
}
