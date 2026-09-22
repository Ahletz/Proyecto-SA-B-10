import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionController } from './transaction.controller';

const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
}

describe('TransactionController (Gateway)', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/api/accounts/')) return jsonResponse({ accountId: 'ACC-1', customerId: 'c1' });
      return jsonResponse({ items: [], page: 1, size: 20, total: 0 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('exige accountId', async () => {
    const controller = new TransactionController(config);
    await expect(controller.history({ user: { role: 'CLIENT', customerId: 'c1' } }, {})).rejects.toThrow(BadRequestException);
  });

  it('un CLIENT consulta su propia cuenta y se reenvían solo los filtros conocidos', async () => {
    const controller = new TransactionController(config);

    await controller.history(
      { user: { role: 'CLIENT', customerId: 'c1' } },
      { accountId: 'ACC-1', status: 'FAILED', from: '2026-09-01T00:00:00Z', page: '2', extra: 'x' },
    );

    expect(calls[0]).toBe('http://localhost:3004/api/accounts/ACC-1');
    expect(calls[1]).toBe(
      'http://localhost:3003/api/transactions?accountId=ACC-1&from=2026-09-01T00%3A00%3A00Z&status=FAILED&page=2',
    );
  });

  it('un CLIENT no puede consultar cuentas ajenas', async () => {
    const controller = new TransactionController(config);

    await expect(
      controller.history({ user: { role: 'CLIENT', customerId: 'otro' } }, { accountId: 'ACC-1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(calls).toHaveLength(1);
  });

  it('ADMIN y CASHIER consultan sin verificación de propiedad', async () => {
    const controller = new TransactionController(config);

    await controller.history({ user: { role: 'CASHIER', customerId: 'x' } }, { accountId: 'ACC-1' });

    expect(calls).toEqual(['http://localhost:3003/api/transactions?accountId=ACC-1']);
  });
});
