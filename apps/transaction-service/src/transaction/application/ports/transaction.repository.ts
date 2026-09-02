import { Transaction } from '../../domain/entities/transaction.entity';

export abstract class TransactionRepository {
  abstract save(transaction: Transaction): Promise<void>;

  abstract findById(
    transactionId: string,
  ): Promise<Transaction | null>;

  abstract findByCorrelationId(
    correlationId: string,
  ): Promise<Transaction | null>;
}
