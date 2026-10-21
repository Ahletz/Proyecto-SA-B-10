import { Transaction } from './transaction.entity';
import { TransactionStatus } from '../enums/transaction-status.enum';
import { InterbankState } from '../enums/interbank-state.enum';

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

describe('Transaction (depósito interbancario)', () => {
  const createInterbank = () => {
    const now = new Date();

    return new Transaction(
      'tx-ib-001',
      'account-001',
      '109732195767',
      150,
      TransactionStatus.PENDING,
      'correlation-ib-001',
      now,
      now,
      null,
      'BANK13',
      InterbankState.PENDING,
    );
  };

  it('avanza SENT -> TIMEOUT -> ACCEPTED y Account confirma el débito', () => {
    const transaction = createInterbank();

    expect(transaction.advanceInterbank(InterbankState.SENT)).toBe(true);
    expect(transaction.advanceInterbank(InterbankState.TIMEOUT)).toBe(true);
    expect(transaction.advanceInterbank(InterbankState.ACCEPTED)).toBe(true);
    expect(transaction.status).toBe(TransactionStatus.PROCESSING);

    expect(transaction.settleInterbank(TransactionStatus.COMPLETED)).toBe(true);
    expect(transaction.status).toBe(TransactionStatus.COMPLETED);
    expect(transaction.interbankState).toBe(InterbankState.ACCEPTED);
  });

  it('un estado final no se sobrescribe con eventos tardíos (timeout después de accepted)', () => {
    const transaction = createInterbank();

    transaction.advanceInterbank(InterbankState.SENT);
    transaction.advanceInterbank(InterbankState.ACCEPTED);

    expect(transaction.advanceInterbank(InterbankState.TIMEOUT)).toBe(false);
    expect(transaction.advanceInterbank(InterbankState.SENT)).toBe(false);
    expect(transaction.advanceInterbank(InterbankState.REVERSED)).toBe(false);
    expect(transaction.interbankState).toBe(InterbankState.ACCEPTED);
  });

  it('rechazado antes de reservar falla; rechazado después de enviar compensa', () => {
    const beforeReserve = createInterbank();
    beforeReserve.advanceInterbank(InterbankState.REJECTED, 'INSUFFICIENT_FUNDS');
    expect(beforeReserve.status).toBe(TransactionStatus.FAILED);
    expect(beforeReserve.settleInterbank(TransactionStatus.COMPENSATED)).toBe(false);

    const afterSend = createInterbank();
    afterSend.advanceInterbank(InterbankState.SENT);
    afterSend.advanceInterbank(InterbankState.REJECTED, 'INTERBANK_ACCOUNT_NOT_FOUND');
    expect(afterSend.status).toBe(TransactionStatus.COMPENSATING);
    expect(afterSend.settleInterbank(TransactionStatus.COMPENSATED)).toBe(true);
    expect(afterSend.status).toBe(TransactionStatus.COMPENSATED);
    expect(afterSend.failureReason).toBe('INTERBANK_ACCOUNT_NOT_FOUND');
  });
});
