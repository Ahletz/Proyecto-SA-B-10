import { describe, expect, it } from 'vitest';
import type { ConsumeMessage } from 'amqplib';

import { BankEvent } from '../../../common/events/bank-event.interface';
import {
  CustomerKycRepository,
  CustomerKycStatus,
} from '../../application/ports/customer-kyc.repository';
import {
  TransactionHistoryQuery,
  TransactionPage,
  TransactionRepository,
} from '../../application/ports/transaction.repository';
import { CreateTransactionService } from '../../application/services/create-transaction.service';
import { CustomerKycService } from '../../application/services/customer-kyc.service';
import { UpdateTransactionStateService } from '../../application/services/update-transaction-state.service';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { EventIdempotencyService } from '../../infrastructure/messaging/event-idempotency.service';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';
import { TransactionEventPublisher } from '../../infrastructure/messaging/transaction-event.publisher';
import {
  KYC_NOT_VERIFIED,
  TransactionEventsConsumer,
  toPaymentFailureReason,
} from './transaction-events.consumer';

class InMemoryTransactionRepository extends TransactionRepository {
  readonly rows = new Map<string, Transaction>();

  async save(transaction: Transaction) {
    this.rows.set(transaction.transactionId, transaction);
  }

  async findById(transactionId: string) {
    return this.rows.get(transactionId) ?? null;
  }

  async findByCorrelationId(correlationId: string) {
    return [...this.rows.values()].find((t) => t.correlationId === correlationId) ?? null;
  }

  async findByAccount(_query: TransactionHistoryQuery): Promise<TransactionPage> {
    return { items: [], total: 0 };
  }
}

class InMemoryCustomerKycRepository extends CustomerKycRepository {
  readonly rows = new Map<string, CustomerKycStatus>();

  async findByCustomerId(customerId: string) {
    return this.rows.get(customerId) ?? null;
  }

  async save(status: CustomerKycStatus) {
    this.rows.set(status.customerId, { ...status });
  }
}

function setup() {
  const published: BankEvent<any>[] = [];
  const rabbit = {
    publish: async (_routingKey: string, event: BankEvent<any>) => {
      published.push(event);
    },
  } as unknown as RabbitMqService;

  const processed = new Set<string>();
  const idempotency = {
    hasBeenProcessed: async (eventId: string) => processed.has(eventId),
    markAsProcessed: async (event: BankEvent) => {
      processed.add(event.eventId);
    },
  } as unknown as EventIdempotencyService;

  const transactions = new InMemoryTransactionRepository();
  const kyc = new InMemoryCustomerKycRepository();

  const consumer = new TransactionEventsConsumer(
    rabbit,
    new CreateTransactionService(transactions),
    new UpdateTransactionStateService(transactions),
    new TransactionEventPublisher(rabbit),
    idempotency,
    new CustomerKycService(kyc),
  );

  // handleMessage es privado: se invoca igual que lo haría RabbitMQ.
  const deliver = (event: Partial<BankEvent<any>>) =>
    (consumer as any).handleMessage({
      content: Buffer.from(
        JSON.stringify({
          eventId: crypto.randomUUID(),
          version: 1,
          timestamp: new Date().toISOString(),
          correlationId: crypto.randomUUID(),
          ...event,
        }),
      ),
    } as ConsumeMessage);

  return { deliver, published, transactions, kyc };
}

function transferRequested(requestedBy?: string, correlationId = crypto.randomUUID()) {
  return {
    eventType: 'transaction.transfer.requested',
    correlationId,
    payload: { sourceAccount: 'ACC-1', targetAccount: 'ACC-2', amount: 100, requestedBy },
  };
}

function kycChanged(customerId: string, estadoNuevo: string, timestamp: string) {
  return {
    eventType: 'customer.kyc.status.changed',
    timestamp,
    payload: { customerId, estadoAnterior: 'PENDING', estadoNuevo },
  };
}

const types = (events: BankEvent<any>[]) => events.map((e) => e.eventType);

describe('TransactionEventsConsumer - validación KYC en la Saga', () => {
  it('cliente VERIFIED: crea la transacción y continúa la Saga', async () => {
    const { deliver, published, transactions } = setup();

    await deliver(kycChanged('CUST-1', 'VERIFIED', '2026-09-01T10:00:00.000Z'));
    await deliver(transferRequested('CUST-1'));

    expect(types(published)).toEqual(['transaction.created', 'transaction.status.changed']);
    expect([...transactions.rows.values()][0].status).toBe(TransactionStatus.PENDING);
  });

  it.each([
    ['sin registro en la proyección', undefined],
    ['en estado PENDING', 'PENDING'],
    ['en estado REJECTED', 'REJECTED'],
  ])('cliente %s: la transacción queda FAILED con KYC_NOT_VERIFIED', async (_label, estado) => {
    const { deliver, published, transactions } = setup();

    if (estado) {
      await deliver(kycChanged('CUST-1', estado, '2026-09-01T10:00:00.000Z'));
    }
    await deliver(transferRequested('CUST-1'));

    expect(types(published)).toEqual(['transaction.failed', 'transaction.status.changed']);
    expect(published[0].payload).toMatchObject({ status: 'FAILED', reason: KYC_NOT_VERIFIED });
    expect(published[1].payload).toMatchObject({ estado: 'FAILED' });
    expect([...transactions.rows.values()][0].status).toBe(TransactionStatus.FAILED);
  });

  it('sin requestedBy no se puede verificar KYC y la transacción falla', async () => {
    const { deliver, published } = setup();

    await deliver(transferRequested(undefined));

    expect(published[0]).toMatchObject({
      eventType: 'transaction.failed',
      payload: { reason: KYC_NOT_VERIFIED },
    });
  });

  it('un reintento de una Saga que ya avanzó no vuelve a publicar eventos', async () => {
    const { deliver, published } = setup();
    const correlationId = crypto.randomUUID();

    await deliver(transferRequested('CUST-1', correlationId));
    published.length = 0;

    // Mismo correlationId con otro eventId: la transacción ya está FAILED.
    await deliver(transferRequested('CUST-1', correlationId));

    expect(published).toEqual([]);
  });

  it('un evento KYC antiguo no revierte un estado más nuevo', async () => {
    const { deliver, kyc } = setup();

    await deliver(kycChanged('CUST-1', 'VERIFIED', '2026-09-01T11:00:00.000Z'));
    await deliver(kycChanged('CUST-1', 'PENDING', '2026-09-01T10:00:00.000Z'));

    expect(kyc.rows.get('CUST-1')?.status).toBe('VERIFIED');
  });
});

describe('TransactionEventsConsumer - motivo del fallo', () => {
  async function startedTransfer() {
    const ctx = setup();
    await ctx.deliver(kycChanged('CUST-1', 'VERIFIED', '2026-09-01T10:00:00.000Z'));
    await ctx.deliver(transferRequested('CUST-1'));
    const transaction = [...ctx.transactions.rows.values()][0];
    const ref = (eventType: string, reason?: string) => ({
      eventType,
      correlationId: transaction.correlationId,
      payload: { transactionId: transaction.transactionId, reason },
    });
    ctx.published.length = 0;
    return { ...ctx, transaction, ref };
  }

  it('KYC no verificado queda guardado como motivo', async () => {
    const { deliver, transactions } = setup();

    await deliver(transferRequested('CUST-1'));

    expect([...transactions.rows.values()][0].failureReason).toBe(KYC_NOT_VERIFIED);
  });

  it('fondos insuficientes guarda el motivo que manda Account', async () => {
    const { deliver, transactions, transaction, ref } = await startedTransfer();

    await deliver(ref('account.funds.rejected', 'INSUFFICIENT_FUNDS'));

    const saved = transactions.rows.get(transaction.transactionId)!;
    expect(saved.status).toBe(TransactionStatus.FAILED);
    expect(saved.failureReason).toBe('INSUFFICIENT_FUNDS');
  });

  it('pago con TIMEOUT: compensa y conserva PAYMENT_TIMEOUT hasta COMPENSATED', async () => {
    const { deliver, published, transactions, transaction, ref } = await startedTransfer();

    await deliver(ref('account.funds.reserved'));
    await deliver(ref('payment.rejected', 'TIMEOUT'));
    await deliver(ref('account.funds.released'));

    const saved = transactions.rows.get(transaction.transactionId)!;
    expect(saved.status).toBe(TransactionStatus.COMPENSATED);
    expect(saved.failureReason).toBe('PAYMENT_TIMEOUT');

    const compensated = published.find((e) => e.eventType === 'transaction.compensated');
    expect(compensated?.payload).toMatchObject({ status: 'COMPENSATED', reason: 'PAYMENT_TIMEOUT' });
  });

  it.each([
    ['TIMEOUT', 'PAYMENT_TIMEOUT'],
    ['EXTERNAL_FAILURE', 'PAYMENT_EXTERNAL_FAILURE'],
    ['PAYMENT_LIMIT_EXCEEDED', 'PAYMENT_LIMIT_EXCEEDED'],
    [undefined, 'PAYMENT_REJECTED'],
  ])('toPaymentFailureReason(%s) = %s', (reason, expected) => {
    expect(toPaymentFailureReason(reason)).toBe(expected);
  });
});
