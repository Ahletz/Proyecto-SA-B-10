import { context, metrics, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

// Nombres y etiquetas según docs/observabilidad/convenciones.md (mismos helpers que Account y Payment).
const tracer = trace.getTracer('bank-usac');
const meter = metrics.getMeter('bank-usac');

export type Outcome = 'success' | 'business_rejection' | 'technical_error';

const operations = meter.createCounter('bank.operations', {
  description: 'Operaciones de negocio por resultado',
});
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

// bank.transfer.duration (s) -> bank_transfer_duration_seconds_*: de la solicitud al estado final de la Saga.
// Histograma (p50/p95/p99, nunca promedio). Los buckets llegan a 300 s porque un depósito interbancario
// puede esperar el vencimiento de 180 s más la consulta y la cancelación del protocolo de timeout.
const transferDuration = meter.createHistogram('bank.transfer.duration', {
  description: 'Latencia de punta a punta del flujo de transferencia (Saga)',
  unit: 's',
  advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300] },
});

export function recordDuplicateEvent(eventType: string) {
  eventsDuplicate.add(1, { event_type: eventType });
}

// Motivos que no son decisiones de negocio sino fallas técnicas (procesador externo o banco pareja sin respuesta):
// solo estas consumen presupuesto de error, igual que en Payment.
const TECHNICAL_REASONS = /^(PAYMENT_(EXTERNAL_FAILURE|TIMEOUT)|INTERBANK_(TIMEOUT|TIMEOUT_NO_RESPONSE|PROCESSING_ERROR))$/;

export function transferOutcome(status: string, failureReason: string | null): Outcome {
  if (status === 'COMPLETED') return 'success';
  return failureReason && TECHNICAL_REASONS.test(failureReason) ? 'technical_error' : 'business_rejection';
}

/** Cierre de una transferencia (COMPLETED, FAILED o COMPENSATED): latencia y resultado, sin ids como etiqueta. */
export function recordTransferResult(t: { status: string; failureReason: string | null; createdAt: Date; updatedAt: Date; isInterbank: boolean }) {
  const outcome = transferOutcome(t.status, t.failureReason);
  const type = t.isInterbank ? 'interbank' : 'internal';
  const seconds = Math.max(0, (t.updatedAt.getTime() - t.createdAt.getTime()) / 1000);
  transferDuration.record(seconds, { type, outcome });
  operations.add(1, { operation: `transaction.transfer.${type}`, outcome });
}

/**
 * Cambio de estado de la Saga como evento del span activo (PENDING, PROCESSING, COMPLETED, FAILED,
 * COMPENSATING, COMPENSATED y los estados interbancarios), con el estado público (PENDING/APPROVED/FAILED).
 */
export function recordSagaState(attributes: Record<string, string | undefined | null>) {
  const span = trace.getActiveSpan();
  if (!span) return;
  const clean = Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== undefined && v !== null)) as Record<string, string>;
  span.addEvent('saga.state_changed', clean);
  for (const [k, v] of Object.entries(clean)) span.setAttribute(k, v);
}

/** Span de negocio hijo del activo, p. ej. transaction.saga.start o transaction.saga.compensate. */
export async function withSagaSpan<T>(name: string, attributes: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  try {
    return await context.with(trace.setSpan(context.active(), span), fn);
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
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
// Una excepción marca el span en error y se vuelve a lanzar para que RabbitMqService aplique reintento/DLQ.
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
