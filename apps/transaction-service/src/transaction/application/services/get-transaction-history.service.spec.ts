import { describe, expect, it } from 'vitest';

import {
  TransactionHistoryQuery,
  TransactionPage,
  TransactionRepository,
} from '../ports/transaction.repository';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { PublicTransactionStatus } from '../../domain/enums/public-transaction-status.enum';
import {
  GetTransactionHistoryService,
  InvalidHistoryQueryError,
} from './get-transaction-history.service';

class FakeTransactionRepository extends TransactionRepository {
  lastQuery?: TransactionHistoryQuery;

  constructor(private readonly page: TransactionPage) {
    super();
  }

  async save(): Promise<void> {}

  async findById(): Promise<Transaction | null> {
    return null;
  }

  async findByCorrelationId(): Promise<Transaction | null> {
    return null;
  }

  async findByAccount(
    query: TransactionHistoryQuery,
  ): Promise<TransactionPage> {
    this.lastQuery = query;
    return this.page;
  }
}

function transaction(
  id: string,
  source: string,
  target: string,
  status: TransactionStatus,
): Transaction {
  const date = new Date('2026-09-01T10:00:00.000Z');
  return new Transaction(id, source, target, 100, status, `corr-${id}`, date, date);
}

describe('GetTransactionHistoryService', () => {
  it('devuelve el estado público, el detallado y la dirección respecto a la cuenta', async () => {
    const repository = new FakeTransactionRepository({
      items: [
        transaction('t1', 'ACC-1', 'ACC-2', TransactionStatus.COMPLETED),
        transaction('t2', 'ACC-3', 'ACC-1', TransactionStatus.COMPENSATED),
      ],
      total: 2,
    });
    const service = new GetTransactionHistoryService(repository);

    const result = await service.execute({ accountId: 'ACC-1', page: 1, size: 20 });

    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      transactionId: 't1',
      direction: 'OUTGOING',
      status: PublicTransactionStatus.APPROVED,
      detailedStatus: TransactionStatus.COMPLETED,
    });
    expect(result.items[1]).toMatchObject({
      transactionId: 't2',
      direction: 'INCOMING',
      status: PublicTransactionStatus.FAILED,
      detailedStatus: TransactionStatus.COMPENSATED,
    });
  });

  it('traduce el filtro de estado público a los estados internos', async () => {
    const repository = new FakeTransactionRepository({ items: [], total: 0 });
    const service = new GetTransactionHistoryService(repository);

    await service.execute({
      accountId: 'ACC-1',
      status: PublicTransactionStatus.FAILED,
      page: 2,
      size: 10,
    });

    expect(repository.lastQuery).toMatchObject({
      accountId: 'ACC-1',
      statuses: [TransactionStatus.FAILED, TransactionStatus.COMPENSATED],
      page: 2,
      size: 10,
    });
  });

  it('no filtra por estado cuando no se indica', async () => {
    const repository = new FakeTransactionRepository({ items: [], total: 0 });
    const service = new GetTransactionHistoryService(repository);

    await service.execute({ accountId: 'ACC-1', page: 1, size: 20 });

    expect(repository.lastQuery?.statuses).toBeUndefined();
  });

  it.each([
    [{ accountId: '', page: 1, size: 20 }, 'accountId'],
    [{ accountId: 'ACC-1', page: 0, size: 20 }, 'page'],
    [{ accountId: 'ACC-1', page: 1, size: 0 }, 'size'],
    [{ accountId: 'ACC-1', page: 1, size: 101 }, 'size'],
    [
      {
        accountId: 'ACC-1',
        page: 1,
        size: 20,
        from: new Date('2026-09-02'),
        to: new Date('2026-09-01'),
      },
      'from',
    ],
  ])('rechaza consultas inválidas (%j)', async (query, field) => {
    const service = new GetTransactionHistoryService(
      new FakeTransactionRepository({ items: [], total: 0 }),
    );

    await expect(service.execute(query)).rejects.toThrow(InvalidHistoryQueryError);
    await expect(service.execute(query)).rejects.toThrow(field);
  });
});
