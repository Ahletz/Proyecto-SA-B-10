import { Injectable } from '@nestjs/common';

import { TransactionRepository } from '../ports/transaction.repository';
import {
  PublicTransactionStatus,
  internalStatusesFor,
  toPublicStatus,
} from '../../domain/enums/public-transaction-status.enum';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';

export const MAX_HISTORY_PAGE_SIZE = 100;

export interface GetTransactionHistoryQuery {
  accountId: string;
  from?: Date;
  to?: Date;
  status?: PublicTransactionStatus;
  page: number;
  size: number;
}

export interface TransactionHistoryItem {
  transactionId: string;
  sourceAccount: string;
  targetAccount: string;
  direction: 'OUTGOING' | 'INCOMING';
  amount: number;
  status: PublicTransactionStatus;
  detailedStatus: TransactionStatus;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionHistoryResult {
  items: TransactionHistoryItem[];
  page: number;
  size: number;
  total: number;
}

export class InvalidHistoryQueryError extends Error {}

@Injectable()
export class GetTransactionHistoryService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(
    query: GetTransactionHistoryQuery,
  ): Promise<TransactionHistoryResult> {
    this.validate(query);

    const { items, total } =
      await this.transactionRepository.findByAccount({
        accountId: query.accountId,
        from: query.from,
        to: query.to,
        statuses: query.status
          ? internalStatusesFor(query.status)
          : undefined,
        page: query.page,
        size: query.size,
      });

    return {
      items: items.map((t) => ({
        transactionId: t.transactionId,
        sourceAccount: t.sourceAccount,
        targetAccount: t.targetAccount,
        direction:
          t.sourceAccount === query.accountId
            ? 'OUTGOING'
            : 'INCOMING',
        amount: t.amount,
        status: toPublicStatus(t.status),
        detailedStatus: t.status,
        correlationId: t.correlationId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      page: query.page,
      size: query.size,
      total,
    };
  }

  private validate(query: GetTransactionHistoryQuery): void {
    if (!query.accountId) {
      throw new InvalidHistoryQueryError('accountId is required');
    }

    if (
      query.from &&
      query.to &&
      query.from.getTime() > query.to.getTime()
    ) {
      throw new InvalidHistoryQueryError(
        'from must be before or equal to to',
      );
    }

    if (!Number.isInteger(query.page) || query.page < 1) {
      throw new InvalidHistoryQueryError(
        'page must be an integer greater than zero',
      );
    }

    if (
      !Number.isInteger(query.size) ||
      query.size < 1 ||
      query.size > MAX_HISTORY_PAGE_SIZE
    ) {
      throw new InvalidHistoryQueryError(
        `size must be an integer between 1 and ${MAX_HISTORY_PAGE_SIZE}`,
      );
    }
  }
}
