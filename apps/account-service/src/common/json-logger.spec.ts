import { beforeAll, describe, expect, it } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { buildLogLine, maskDocument, maskEmail, maskSensitive } from './json-logger';
import { runWithCorrelationId } from './correlation';

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(new BasicTracerProvider());
});

describe('JsonLogger', () => {
  it('incluye los campos obligatorios de la convención', () => {
    const line = buildLogLine('INFO', 'Cuenta creada', ['AccountService']);
    expect(Object.keys(line)).toEqual(
      expect.arrayContaining(['timestamp', 'level', 'serviceName', 'environment', 'version', 'correlationId', 'traceId', 'spanId', 'message']),
    );
    expect(line.level).toBe('INFO');
    expect(line.serviceName).toBe('account-service');
    expect(line.context).toBe('AccountService');
    expect(new Date(line.timestamp as string).toISOString()).toBe(line.timestamp);
  });

  it('sin traza ni correlación deja traceId, spanId y correlationId vacíos', () => {
    const line = buildLogLine('INFO', 'x');
    expect(line.traceId).toBe('');
    expect(line.spanId).toBe('');
    expect(line.correlationId).toBe('');
  });

  it('toma correlationId, traceId y spanId del contexto activo', () => {
    const correlationId = '0b6f1a52-9c1e-4d7b-8f3a-2c4d5e6f7a8b';
    const line = runWithCorrelationId(correlationId, () =>
      trace.getTracer('t').startActiveSpan('op', (span) => {
        const l = buildLogLine('INFO', 'dentro del span');
        span.end();
        return l;
      }),
    );
    expect(line.correlationId).toBe(correlationId);
    expect(line.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(line.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('enmascara datos sensibles de un evento estructurado y conserva el detalle útil', () => {
    const line = buildLogLine('INFO', {
      message: 'Cliente verificado',
      event: 'customer.kyc.verified',
      accountId: 'acc-1',
      email: 'maria@correo.com',
      dpi: '1234567890101',
      password: 'secreto',
      token: 'abc',
      nested: { authorization: 'Bearer xyz', amount: 50 },
    });
    expect(line.event).toBe('customer.kyc.verified');
    expect(line.data).toEqual({
      accountId: 'acc-1',
      email: 'm***@correo.com',
      dpi: '*********0101',
      password: '***',
      token: '***',
      nested: { authorization: '***', amount: 50 },
    });
  });

  it('enmascara correos y tokens Bearer dentro del texto del mensaje', () => {
    const line = buildLogLine('WARN', 'Falló login de maria@correo.com con Bearer abc.def.ghi');
    expect(line.message).toBe('Falló login de m***@correo.com con Bearer ***');
  });

  it('en ERROR guarda el stack y el contexto', () => {
    const line = buildLogLine('ERROR', 'falló', ['Error: falló\n  at x', 'RabbitService']);
    expect(line.context).toBe('RabbitService');
    expect(line.error).toEqual({ message: 'falló', stack: 'Error: falló\n  at x' });
  });

  it('acepta un Error directamente', () => {
    const line = buildLogLine('ERROR', new Error('db caída'));
    expect(line.message).toBe('db caída');
    expect((line.error as { stack?: string }).stack).toContain('db caída');
  });
});

describe('enmascarado', () => {
  it('maskEmail y maskDocument', () => {
    expect(maskEmail('maria@correo.com')).toBe('m***@correo.com');
    expect(maskDocument('1234567890101')).toBe('*********0101');
    expect(maskDocument('123')).toBe('****');
  });

  it('no revienta con ciclos profundos', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 20; i++) { cursor.next = {}; cursor = cursor.next as Record<string, unknown>; }
    expect(() => maskSensitive(deep)).not.toThrow();
  });
});
