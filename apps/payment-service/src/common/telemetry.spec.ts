import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { timed, withConsumerSpan, withProducerSpan } from './telemetry';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));
});

beforeEach(() => exporter.reset());

const message = (headers: Record<string, unknown>) => ({
  fields: { routingKey: 'account.funds.reserved' },
  properties: { headers, correlationId: 'corr-1', messageId: 'evt-1' },
});

describe('telemetría de RabbitMQ', () => {
  it('el publicador mete traceparent y el consumidor queda como hijo en la misma traza', async () => {
    let headers: Record<string, unknown> = {};
    withProducerSpan('account.funds.reserved', 'corr-1', (h) => { headers = h; });
    expect(typeof headers.traceparent).toBe('string');

    await withConsumerSpan(message(headers), async () => 'ok');

    const spans = exporter.getFinishedSpans();
    const publish = spans.find((s) => s.name === 'publish account.funds.reserved')!;
    const process = spans.find((s) => s.name === 'process account.funds.reserved')!;
    expect(process.spanContext().traceId).toBe(publish.spanContext().traceId);
    expect(process.parentSpanContext?.spanId).toBe(publish.spanContext().spanId);
  });

  it('anota el correlationId y el routing key en los spans', async () => {
    let headers: Record<string, unknown> = {};
    withProducerSpan('account.funds.reserved', 'corr-1', (h) => { headers = h; });
    await withConsumerSpan(message(headers), async () => 'ok');

    for (const span of exporter.getFinishedSpans()) {
      expect(span.attributes['bank.correlation_id']).toBe('corr-1');
      expect(span.attributes['messaging.rabbitmq.destination.routing_key']).toBe('account.funds.reserved');
    }
  });

  it('si el handler falla, el span queda en error y la excepción se relanza para reintento/DLQ', async () => {
    await expect(withConsumerSpan(message({}), async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    const span = exporter.getFinishedSpans().find((s) => s.name === 'process account.funds.reserved')!;
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('un mensaje sin traceparent igual se procesa (abre una traza nueva)', async () => {
    await withConsumerSpan(message({}), async () => 'ok');
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });
});

describe('timed (operaciones de negocio)', () => {
  it('registra el resultado clasificado y devuelve el valor', async () => {
    const result = await timed('account.reserve', async () => ({ ok: false }), (r) => (r.ok ? 'success' : 'business_rejection'));
    expect(result).toEqual({ ok: false });
    const span = exporter.getFinishedSpans().find((s) => s.name === 'account.reserve')!;
    expect(span.attributes['bank.operation.outcome']).toBe('business_rejection');
  });

  it('una excepción es technical_error y se relanza', async () => {
    await expect(timed('account.reserve', async () => { throw new Error('db caída'); })).rejects.toThrow('db caída');
    const span = exporter.getFinishedSpans().find((s) => s.name === 'account.reserve')!;
    expect(span.attributes['bank.operation.outcome']).toBe('technical_error');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });
});
