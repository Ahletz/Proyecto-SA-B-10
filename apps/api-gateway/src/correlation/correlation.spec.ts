import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import { proxyJson } from '../controllers/proxy.util';
import {
  CORRELATION_HEADER,
  correlationMiddleware,
  currentCorrelationId,
  resolveCorrelationId,
} from './correlation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function runMiddleware(header?: string) {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as ExpressResponse;
  let seen: string | undefined;
  const next: NextFunction = () => {
    seen = currentCorrelationId();
  };
  correlationMiddleware({ headers: header ? { 'x-correlation-id': header } : {} } as unknown as Request, res, next);
  return { seen, responseHeader: headers[CORRELATION_HEADER] };
}

describe('correlationId en el Gateway', () => {
  it('conserva el UUID que manda el cliente', () => {
    const id = '0b6f1a52-9c1e-4d7b-8f3a-2c4d5e6f7a8b';
    expect(runMiddleware(id)).toEqual({ seen: id, responseHeader: id });
  });

  it.each([undefined, '', 'prueba-no-uuid', 'x'.repeat(200)])(
    'genera un UUID nuevo si el header es %j',
    (header) => {
      const { seen, responseHeader } = runMiddleware(header);
      expect(seen).toMatch(UUID);
      expect(responseHeader).toBe(seen);
      expect(seen).not.toBe(header);
    },
  );

  it('normaliza a minúsculas (Transaction busca por correlationId exacto)', () => {
    expect(resolveCorrelationId('0B6F1A52-9C1E-4D7B-8F3A-2C4D5E6F7A8B')).toBe('0b6f1a52-9c1e-4d7b-8f3a-2c4d5e6f7a8b');
  });

  it('fuera de un request no hay correlationId', () => {
    expect(currentCorrelationId()).toBeUndefined();
  });

  describe('proxyJson', () => {
    let sent: Record<string, string>[];

    beforeEach(() => {
      sent = [];
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(init.headers as Record<string, string>);
        return { ok: true, status: 200, text: async () => '{}' } as Response;
      }));
    });

    afterEach(() => vi.unstubAllGlobals());

    it('propaga el correlationId del request a todas las llamadas', async () => {
      const id = '0b6f1a52-9c1e-4d7b-8f3a-2c4d5e6f7a8b';
      await new Promise<void>((done) => {
        correlationMiddleware(
          { headers: { 'x-correlation-id': id } } as unknown as Request,
          { setHeader: () => undefined } as unknown as ExpressResponse,
          async () => {
            await proxyJson('http://svc', '/a', 'GET');
            await proxyJson('http://svc', '/b', 'POST', {}, { Authorization: 'Bearer t' });
            done();
          },
        );
      });

      expect(sent.map((h) => h[CORRELATION_HEADER])).toEqual([id, id]);
      expect(sent[1].Authorization).toBe('Bearer t');
    });
  });
});
