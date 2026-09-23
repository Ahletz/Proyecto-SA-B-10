import { TransactionStatus } from './transaction-status.enum';

/**
 * Estados que el contrato de Fase 2 expone hacia fuera
 * (historial y evento `transaction.status.changed`).
 * Los estados internos de la Saga se agrupan en estos tres.
 */
export enum PublicTransactionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  FAILED = 'FAILED',
}

const INTERNAL_BY_PUBLIC: Record<
  PublicTransactionStatus,
  TransactionStatus[]
> = {
  [PublicTransactionStatus.PENDING]: [
    TransactionStatus.PENDING,
    TransactionStatus.PROCESSING,
    TransactionStatus.COMPENSATING,
  ],
  [PublicTransactionStatus.APPROVED]: [
    TransactionStatus.COMPLETED,
  ],
  [PublicTransactionStatus.FAILED]: [
    TransactionStatus.FAILED,
    TransactionStatus.COMPENSATED,
  ],
};

export function toPublicStatus(
  status: TransactionStatus,
): PublicTransactionStatus {
  const entry = Object.entries(INTERNAL_BY_PUBLIC).find(
    ([, internal]) => internal.includes(status),
  );

  if (!entry) {
    throw new Error(`Unknown transaction status ${status}`);
  }

  return entry[0] as PublicTransactionStatus;
}

export function internalStatusesFor(
  status: PublicTransactionStatus,
): TransactionStatus[] {
  return [...INTERNAL_BY_PUBLIC[status]];
}

export function isPublicTransactionStatus(
  value: string,
): value is PublicTransactionStatus {
  return Object.values(PublicTransactionStatus).includes(
    value as PublicTransactionStatus,
  );
}
