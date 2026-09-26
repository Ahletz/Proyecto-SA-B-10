import { describe, expect, it, vi } from 'vitest';
import { PaymentService } from './payment.service';

function fakeRepo(overrides: Partial<Record<string, any>> = {}) {
  return {
    create: vi.fn((x: any) => x),
    save: vi.fn(async (x: any) => x),
    findOneBy: vi.fn(async () => null),
    existsBy: vi.fn(async () => false),
    find: vi.fn(async () => []),
    ...overrides,
  };
}

function makeService(configValues: Record<string, string> = {}, paymentsOverride?: any) {
  const payments = paymentsOverride ?? fakeRepo();
  const processed = fakeRepo();
  const rabbit = { publish: vi.fn(async () => undefined) };
  const config = { get: (key: string, fallback?: string) => configValues[key] ?? fallback };
  const service = new PaymentService(payments as any, processed as any, rabbit as any, config as any);
  return { service, payments, processed, rabbit };
}

const baseEvent = {
  eventId: 'e1', eventType: 'account.funds.reserved', version: 1, timestamp: '', correlationId: 'c1',
  payload: { transactionId: 'tx-1', amount: 100 },
};

describe('PaymentService - validaciones antes de simular', () => {
  it('rechaza un monto invalido (<= 0) sin llegar a simular', async () => {
    const { service, rabbit } = makeService();
    await service.handle({ ...baseEvent, payload: { transactionId: 'tx-1', amount: 0 } } as any);
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'payment.rejected', payload: expect.objectContaining({ reason: 'INVALID_AMOUNT' }) }));
  });

  it('rechaza un monto que excede PAYMENT_MAX_AMOUNT', async () => {
    const { service, rabbit } = makeService({ PAYMENT_MAX_AMOUNT: '500' });
    await service.handle({ ...baseEvent, payload: { transactionId: 'tx-1', amount: 1000 } } as any);
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'payment.rejected', payload: expect.objectContaining({ reason: 'PAYMENT_LIMIT_EXCEEDED' }) }));
  });

  it('no procesa dos veces el mismo transactionId', async () => {
    const payments = fakeRepo({ findOneBy: vi.fn(async () => ({ paymentId: 'p1' })) });
    const { service, rabbit } = makeService({}, payments);

    await service.handle(baseEvent as any);

    expect(rabbit.publish).not.toHaveBeenCalled();
  });
});

describe('PaymentService - simulacion de resultado externo', () => {
  it('aprueba siempre cuando la tasa de fallo y timeout son 0', async () => {
    const { service, rabbit } = makeService({ PAYMENT_SIMULATE_FAILURE_RATE: '0', PAYMENT_SIMULATE_TIMEOUT_RATE: '0' });
    await service.handle(baseEvent as any);
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'payment.approved' }));
  });

  it('rechaza con EXTERNAL_FAILURE cuando la tasa de fallo es 1', async () => {
    const { service, rabbit } = makeService({ PAYMENT_SIMULATE_FAILURE_RATE: '1', PAYMENT_SIMULATE_TIMEOUT_RATE: '0' });
    await service.handle(baseEvent as any);
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'payment.rejected', payload: expect.objectContaining({ reason: 'EXTERNAL_FAILURE' }) }));
  });

  it('rechaza con TIMEOUT cuando la tasa de timeout es 1', async () => {
    const { service, rabbit } = makeService({ PAYMENT_SIMULATE_TIMEOUT_RATE: '1', PAYMENT_SIMULATE_TIMEOUT_MS: '1' });
    await service.handle(baseEvent as any);
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'payment.rejected', payload: expect.objectContaining({ reason: 'TIMEOUT' }) }));
  }, 10000);
});
