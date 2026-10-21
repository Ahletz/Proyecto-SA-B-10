import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

// Mismo helper que los servicios (docs/observabilidad/convenciones.md): span "publish <routingKey>" (PRODUCER)
// y traceparent en los headers AMQP, para que la Saga que abre el Gateway quede en la misma traza que el request HTTP.
const tracer = trace.getTracer('bank-usac');

export function withProducerSpan<T>(routingKey: string, correlationId: string | undefined, fn: (headers: Record<string, unknown>) => T): T {
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
