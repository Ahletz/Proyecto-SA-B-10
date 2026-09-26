import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithCorrelationId } from '../correlation/correlation';
import type { RabbitService } from '../rabbit/rabbit.service';
import { TransferController } from './transfer.controller';

const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;

describe('TransferController (Gateway) - correlationId', () => {
  let published: { eventType: string; correlationId: string }[];
  let accountHeaders: Record<string, string>;
  const rabbit = {
    publish: async (eventType: string, correlationId: string) => {
      published.push({ eventType, correlationId });
      return { eventId: 'evt-1' };
    },
  } as unknown as RabbitService;

  beforeEach(() => {
    published = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      accountHeaders = init.headers as Record<string, string>;
      return { ok: true, status: 200, text: async () => JSON.stringify({ customerId: 'c1' }) } as Response;
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('la Saga usa el mismo correlationId que el request y que la consulta a Account', async () => {
    const id = '0b6f1a52-9c1e-4d7b-8f3a-2c4d5e6f7a8b';
    const controller = new TransferController(rabbit, config);

    const response = await runWithCorrelationId(id, () =>
      controller.create({ user: { customerId: 'c1' } }, { sourceAccount: 'A', targetAccount: 'B', amount: 10 }),
    );

    expect(response.correlationId).toBe(id);
    expect(published).toEqual([{ eventType: 'transaction.transfer.requested', correlationId: id }]);
    expect(accountHeaders['X-Correlation-Id']).toBe(id);
  });
});

describe('TransferController (Gateway) - estado por correlationId', () => {
  const rabbit = {} as RabbitService;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      const body = url.includes('/api/transactions/correlation/')
        ? { transactionId: 't1', sourceAccount: 'A', status: 'COMPLETED' }
        : { accountId: 'A', customerId: 'c1' };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('devuelve el estado al CLIENT dueño de la cuenta origen', async () => {
    const controller = new TransferController(rabbit, config);

    const result = await controller.status({ user: { role: 'CLIENT', customerId: 'c1' } }, 'cid-1');

    expect(result.status).toBe('COMPLETED');
    expect(calls[1]).toBe('http://localhost:3004/api/accounts/A');
  });

  it('rechaza con 403 a un CLIENT que no es dueño de la cuenta origen', async () => {
    const controller = new TransferController(rabbit, config);

    await expect(
      controller.status({ user: { role: 'CLIENT', customerId: 'otro' } }, 'cid-1'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('ADMIN consulta sin verificar propiedad', async () => {
    const controller = new TransferController(rabbit, config);

    await controller.status({ user: { role: 'ADMIN', customerId: 'admin' } }, 'cid-1');

    expect(calls).toHaveLength(1);
  });
});
