import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';

export interface TransactionHistoryQuery {
  accountId: string;
  from?: Date;
  to?: Date;
  statuses?: TransactionStatus[];
  page: number;
  size: number;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
}

export abstract class TransactionRepository {
  abstract save(transaction: Transaction): Promise<void>;

  abstract findById(
    transactionId: string,
  ): Promise<Transaction | null>;

  abstract findByCorrelationId(
    correlationId: string,
  ): Promise<Transaction | null>;

  /**
   * Transacciones donde la cuenta es origen o destino,
   * de la más reciente a la más antigua.
   */
  abstract findByAccount(
    query: TransactionHistoryQuery,
  ): Promise<TransactionPage>;
}
