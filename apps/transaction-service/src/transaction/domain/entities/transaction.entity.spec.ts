import { Transaction } from './transaction.entity';
import { TransactionStatus } from '../enums/transaction-status.enum';

describe('Transaction', () => {
  const createTransaction = () => {
    const now = new Date();

    return new Transaction(
      'tx-001',
      'account-001',
      'account-002',
      500,
      TransactionStatus.PENDING,
      'correlation-001',
      now,
      now,
    );
  };

  it('should create a pending transaction', () => {
    const transaction = createTransaction();

    expect(transaction.status).toBe(TransactionStatus.PENDING);
    expect(transaction.amount).toBe(500);
  });

  it('should move from pending to processing', () => {
    const transaction = createTransaction();

    transaction.markAsProcessing();

    expect(transaction.status).toBe(TransactionStatus.PROCESSING);
  });

  it('should move from processing to completed', () => {
    const transaction = createTransaction();

    transaction.markAsProcessing();
    transaction.markAsCompleted();

    expect(transaction.status).toBe(TransactionStatus.COMPLETED);
  });

  it('should reject a transaction with zero amount', () => {
    const now = new Date();

    expect(
      () =>
        new Transaction(
          'tx-001',
          'account-001',
          'account-002',
          0,
          TransactionStatus.PENDING,
          'correlation-001',
          now,
          now,
        ),
    ).toThrow('Amount must be greater than zero');
  });

  it('should reject a transfer to the same account', () => {
    const now = new Date();

    expect(
      () =>
        new Transaction(
          'tx-001',
          'account-001',
          'account-001',
          500,
          TransactionStatus.PENDING,
          'correlation-001',
          now,
          now,
        ),
    ).toThrow('Source and target accounts must be different');
  });

  it('should not complete a pending transaction directly', () => {
    const transaction = createTransaction();

    expect(() => transaction.markAsCompleted()).toThrow();
  });

  it('should execute compensation flow', () => {
    const transaction = createTransaction();

    transaction.markAsProcessing();
    transaction.markAsCompensating();

    expect(transaction.status).toBe(
      TransactionStatus.COMPENSATING,
    );

    transaction.markAsCompensated();

    expect(transaction.status).toBe(
      TransactionStatus.COMPENSATED,
    );
  });
});
