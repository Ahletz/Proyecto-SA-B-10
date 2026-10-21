import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterbankController } from './interbank.controller';

const config = { get: (key: string, fallback: string) => (key === 'INTERBANK_API_KEYS' ? '{"BANK13":"clave-13"}' : fallback) } as unknown as ConfigService;
const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

function response() {
  const r = { code: 0, body: '', headers: {} as Record<string, string> };
  const res = { status: (c: number) => { r.code = c; return res; }, setHeader: (k: string, v: string) => { r.headers[k] = v; }, send: (b: string) => { r.body = b; } };
  return { r, res };
}

describe('InterbankController (Gateway)', () => {
  let calls: { url: string; init: RequestInit }[];
  beforeEach(() => {
    // Sin SDK (como en los tests) el Gateway reenvía el traceparent a mano.
    process.env.OTEL_SDK_DISABLED = 'true';
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status: 202, headers: new Headers({ 'content-type': 'application/json' }), text: async () => '{"status":"PROCESSING"}' } as Response;
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OTEL_SDK_DISABLED; });

  it('reenvía a Payment con el banco dueño de la clave, aunque el cliente mande otro X-Caller-Bank-Code', async () => {
    const { r, res } = response();
    await new InterbankController(config).receive({ body: { amount: '1.00' } }, res, { 'x-api-key': 'clave-13', 'x-caller-bank-code': 'BANK08', traceparent, 'idempotency-key': 'k1' });
    expect(r.code).toBe(202);
    expect(calls[0].url).toBe('http://localhost:3005/interbank/v1/transfers');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-caller-bank-code']).toBe('BANK13');
    expect(headers.traceparent).toBe(traceparent);
    expect(headers['idempotency-key']).toBe('k1');
  });

  it('rechaza una clave inválida (401) y la falta de traceparent (400) sin llamar a Payment', async () => {
    const bad = response();
    await new InterbankController(config).receive({ body: {} }, bad.res, { 'x-api-key': 'otra', traceparent });
    const noTrace = response();
    await new InterbankController(config).receive({ body: {} }, noTrace.res, { 'x-api-key': 'clave-13' });
    expect(bad.r.code).toBe(401);
    expect(noTrace.r.code).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
