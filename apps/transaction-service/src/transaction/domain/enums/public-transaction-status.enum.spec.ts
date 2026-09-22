import { describe, expect, it } from 'vitest';

import { TransactionStatus } from './transaction-status.enum';
import {
  PublicTransactionStatus,
  internalStatusesFor,
  isPublicTransactionStatus,
  toPublicStatus,
} from './public-transaction-status.enum';

describe('PublicTransactionStatus', () => {
  it.each([
    [TransactionStatus.PENDING, PublicTransactionStatus.PENDING],
    [TransactionStatus.PROCESSING, PublicTransactionStatus.PENDING],
    [TransactionStatus.COMPENSATING, PublicTransactionStatus.PENDING],
    [TransactionStatus.COMPLETED, PublicTransactionStatus.APPROVED],
    [TransactionStatus.FAILED, PublicTransactionStatus.FAILED],
    [TransactionStatus.COMPENSATED, PublicTransactionStatus.FAILED],
  ])('%s se expone como %s', (internal, expected) => {
    expect(toPublicStatus(internal)).toBe(expected);
  });

  it('cada estado interno pertenece a exactamente un estado público', () => {
    const all = Object.values(PublicTransactionStatus).flatMap(internalStatusesFor);

    expect(all.sort()).toEqual(Object.values(TransactionStatus).sort());
  });

  it('reconoce solo los estados del contrato', () => {
    expect(isPublicTransactionStatus('APPROVED')).toBe(true);
    expect(isPublicTransactionStatus('COMPLETED')).toBe(false);
  });
});
