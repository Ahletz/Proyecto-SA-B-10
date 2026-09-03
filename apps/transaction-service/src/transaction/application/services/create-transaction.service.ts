import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { TransactionRepository } from '../ports/transaction.repository';

export interface CreateTransactionCommand {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  correlationId: string;
}

@Injectable()
export class CreateTransactionService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async execute(
    command: CreateTransactionCommand,
  ): Promise<Transaction> {
    const existingTransaction =
      await this.transactionRepository.findByCorrelationId(
        command.correlationId,
      );

    if (existingTransaction) {
      return existingTransaction;
    }

    const now = new Date();

    const transaction = new Transaction(
      randomUUID(),
      command.sourceAccount,
      command.targetAccount,
      command.amount,
      TransactionStatus.PENDING,
      command.correlationId,
      now,
      now,
    );

    await this.transactionRepository.save(transaction);

    return transaction;
  }
}
