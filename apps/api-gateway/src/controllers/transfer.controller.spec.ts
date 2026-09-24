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
