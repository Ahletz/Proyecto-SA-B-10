import { describe, expect, it, vi } from 'vitest';
import { AccountService } from './account.service';

function fakeRepo(overrides: Partial<Record<string, any>> = {}) {
  return {
    create: vi.fn((x: any) => x),
    save: vi.fn(async (x: any) => x),
    find: vi.fn(async () => []),
    findOneBy: vi.fn(async () => null),
    findOneByOrFail: vi.fn(async () => { throw new Error('not found'); }),
    existsBy: vi.fn(async () => false),
    createQueryBuilder: vi.fn(),
    ...overrides,
  };
}

function makeService(overrides: { accounts?: any; reservations?: any; processed?: any } = {}) {
  const accounts = overrides.accounts ?? fakeRepo();
  const reservations = overrides.reservations ?? fakeRepo();
  const processed = overrides.processed ?? fakeRepo();
  const rabbit = { publish: vi.fn(async () => undefined) };
  const service = new AccountService(accounts, reservations, processed, rabbit as any);
  return { service, accounts, reservations, processed, rabbit };
}

describe('AccountService - creacion de cuenta', () => {
  it('asigna minBalance 0 por defecto para cuentas MONETARY', async () => {
    const { service } = makeService();
    const dto = await service.create('CUST-1', 'MONETARY', 100);
    expect(dto.minBalance).toBe(0);
    expect(dto.feeAmount).toBeNull();
  });

  it('asigna minBalance 50 por defecto para cuentas SAVINGS', async () => {
    const { service } = makeService();
    const dto = await service.create('CUST-1', 'SAVINGS', 100);
    expect(dto.minBalance).toBe(50);
  });

  it('respeta un minBalance explicito distinto del default', async () => {
    const { service } = makeService();
    const dto = await service.create('CUST-1', 'SAVINGS', 100, 20);
    expect(dto.minBalance).toBe(20);
  });

  it('guarda la comision cuando se especifica', async () => {
    const { service } = makeService();
    const dto = await service.create('CUST-1', 'MONETARY', 100, undefined, 15);
    expect(dto.feeAmount).toBe(15);
  });

  it('rechaza un tipo de cuenta invalido', async () => {
    const { service } = makeService();
    await expect(service.create('CUST-1', 'INVALID' as any, 100)).rejects.toThrow('Invalid account type');
  });
});

describe('AccountService - reserva de fondos (Saga)', () => {
  const baseEvent = {
    eventId: 'e1', eventType: 'transaction.created', version: 1, timestamp: '', correlationId: 'c1',
    payload: { transactionId: 'tx-1', sourceAccount: 'src', targetAccount: 'tgt', amount: 100 },
  };

  it('reserva monto + comision cuando hay saldo suficiente', async () => {
    const source = { accountId: 'src', balance: '200.00', reservedBalance: '0.00', minBalance: '0.00', feeAmount: '10.00', status: 'ACTIVE' };
    const target = { accountId: 'tgt', balance: '0.00', reservedBalance: '0.00', minBalance: '0.00', feeAmount: null, status: 'ACTIVE' };
    const accounts = fakeRepo({ findOneBy: vi.fn(async ({ accountId }: any) => (accountId === 'src' ? source : target)) });
    const { service, reservations, rabbit } = makeService({ accounts });

    await service.handle(baseEvent as any);

    expect(source.reservedBalance).toBe('110.00');
    expect(reservations.save).toHaveBeenCalledWith(expect.objectContaining({ amount: '100.00', feeAmount: '10.00', status: 'RESERVED' }));
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'account.funds.reserved' }));
  });

  it('rechaza por fondos insuficientes cuando el disponible no cubre monto + comision + minBalance', async () => {
    const source = { accountId: 'src', balance: '105.00', reservedBalance: '0.00', minBalance: '10.00', feeAmount: '10.00', status: 'ACTIVE' };
    const target = { accountId: 'tgt', balance: '0.00', reservedBalance: '0.00', minBalance: '0.00', feeAmount: null, status: 'ACTIVE' };
    const accounts = fakeRepo({ findOneBy: vi.fn(async ({ accountId }: any) => (accountId === 'src' ? source : target)) });
    const { service, rabbit } = makeService({ accounts });

    await service.handle(baseEvent as any);

    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'account.funds.rejected', payload: expect.objectContaining({ reason: 'INSUFFICIENT_FUNDS' }) }));
  });

  it('rechaza si la cuenta origen no existe', async () => {
    const accounts = fakeRepo({ findOneBy: vi.fn(async () => null) });
    const { service, rabbit } = makeService({ accounts });

    await service.handle(baseEvent as any);

    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'account.funds.rejected', payload: expect.objectContaining({ reason: 'ACCOUNT_NOT_FOUND_OR_INACTIVE' }) }));
  });

  it('no reserva dos veces la misma transaccion (idempotencia)', async () => {
    const reservations = fakeRepo({ existsBy: vi.fn(async () => true) });
    const { service, rabbit } = makeService({ reservations });

    await service.handle(baseEvent as any);

    expect(rabbit.publish).not.toHaveBeenCalled();
  });
});

describe('AccountService - liberacion de fondos (compensacion)', () => {
  it('libera monto + comision reservados cuando Payment rechaza', async () => {
    const source = { accountId: 'src', balance: '200.00', reservedBalance: '110.00', minBalance: '0.00', feeAmount: null, status: 'ACTIVE' };
    const reservation = { transactionId: 'tx-1', sourceAccount: 'src', targetAccount: 'tgt', amount: '100.00', feeAmount: '10.00', status: 'RESERVED' };
    const accounts = fakeRepo({ findOneByOrFail: vi.fn(async () => source) });
    const reservations = fakeRepo({ findOneBy: vi.fn(async () => reservation) });
    const { service, rabbit } = makeService({ accounts, reservations });

    await service.handle({ eventId: 'e2', eventType: 'payment.rejected', version: 1, timestamp: '', correlationId: 'c1', payload: { transactionId: 'tx-1' } } as any);

    expect(source.reservedBalance).toBe('0.00');
    expect(reservation.status).toBe('RELEASED');
    expect(rabbit.publish).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'account.funds.released' }));
  });
});
