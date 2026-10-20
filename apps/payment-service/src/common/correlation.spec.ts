import { describe, expect, it } from 'vitest';
import { CORRELATION_HEADER, correlationMiddleware, currentCorrelationId, resolveCorrelationId } from './correlation';

const run = (header?: string) => {
  const responseHeaders: Record<string, string> = {};
  let seen: string | undefined;
  correlationMiddleware(
    { headers: header ? { 'x-correlation-id': header } : {} },
    { setHeader: (n, v) => { responseHeaders[n] = v; } },
    () => { seen = currentCorrelationId(); },
  );
  return { seen, responseHeaders };
};

describe('correlationId en el servicio', () => {
  it('reutiliza el X-Correlation-Id del Gateway, normalizado a minúsculas', () => {
    const { seen, responseHeaders } = run('0B6F1A52-9C1E-4D7B-8F3A-2C4D5E6F7A8B');
    expect(seen).toBe('0b6f1a52-9c1e-4d7b-8f3a-2c4d5e6f7a8b');
    expect(responseHeaders[CORRELATION_HEADER]).toBe(seen);
  });

  it('si no es un UUID genera uno nuevo', () => {
    const { seen } = run('no-soy-un-uuid');
    expect(seen).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(seen).not.toBe('no-soy-un-uuid');
  });

  it('sin header genera uno nuevo', () => {
    expect(run().seen).toBeDefined();
  });

  it('fuera de un request no hay correlationId', () => {
    expect(currentCorrelationId()).toBeUndefined();
    expect(resolveCorrelationId(undefined)).toBeDefined();
  });
});
