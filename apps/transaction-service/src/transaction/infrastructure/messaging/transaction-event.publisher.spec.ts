import { describe, expect, it } from 'vitest';

import { BankEvent } from '../../../common/events/bank-event.interface';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { RabbitMqService } from './rabbitmq.service';
import { TransactionEventPublisher } from './transaction-event.publisher';

function publisherWithSpy() {
  const published: BankEvent<any>[] = [];
  const rabbit = {
    publish: async (_routingKey: string, event: BankEvent<any>) => {
      published.push(event);
    },
  } as unknown as RabbitMqService;

  return { publisher: new TransactionEventPublisher(rabbit), published };
}

function transaction(status: TransactionStatus): Transaction {
  const date = new Date('2026-09-01T10:00:00.000Z');
  return new Transaction('t1', 'ACC-1', 'ACC-2', 50, status, 'corr-1', date, date);
}

describe('TransactionEventPublisher - transaction.status.changed', () => {
  it.each([
    ['publishTransactionCreated', TransactionStatus.PENDING, 'PENDING'],
    ['publishTransactionCompleted', TransactionStatus.COMPLETED, 'APPROVED'],
    ['publishTransactionCompensated', TransactionStatus.COMPENSATED, 'FAILED'],
  ] as const)('%s publica el estado público %s', async (method, status, estado) => {
    const { publisher, published } = publisherWithSpy();

    await publisher[method](transaction(status));

    const changed = published.find((e) => e.eventType === 'transaction.status.changed');
    expect(changed).toBeDefined();
    expect(changed?.correlationId).toBe('corr-1');
    expect(changed?.payload).toEqual({
      transactionId: 't1',
      accountId: 'ACC-1',
      estado,
      fecha: '2026-09-01T10:00:00.000Z',
    });
  });

  it('publishTransactionFailed publica FAILED después de transaction.failed', async () => {
    const { publisher, published } = publisherWithSpy();

    await publisher.publishTransactionFailed(transaction(TransactionStatus.FAILED), 'FUNDS_REJECTED');

    expect(published.map((e) => e.eventType)).toEqual([
      'transaction.failed',
      'transaction.status.changed',
    ]);
    expect(published[1].payload.estado).toBe('FAILED');
    expect(published[1].eventId).not.toBe(published[0].eventId);
  });
});
