import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminController,auditPath } from './admin.controller';

describe('AdminController - simulación de fallos de Payment', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reenvía el cambio a Payment con el X-Admin-Token del Secret', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => '{"failureRate":0.6}' } as Response;
    }));
    const config = { get: (key: string, fallback?: string) => (key === 'PAYMENT_ADMIN_TOKEN' ? 'tok' : fallback) } as unknown as ConfigService;

    const result = await new AdminController(config).setSimulation({ failureRate: 0.6 });

    expect(result).toEqual({ failureRate: 0.6 });
    expect(calls[0].url).toBe('http://localhost:3005/internal/payment-simulation');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>)['X-Admin-Token']).toBe('tok');
  });
});

describe('Audit filters',()=>{it('forwards encoded filters and rejects unrelated query keys',()=>{expect(auditPath({correlationId:'a&b',traceId:'123',paged:'true',unknown:'x'})).toBe('/api/audit/events?correlationId=a%26b&traceId=123&paged=true');});});
