import { Injectable } from '@nestjs/common';

import { TransactionRepository } from '../ports/transaction.repository';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';

@Injectable()
export class UpdateTransactionStateService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async markAsProcessing(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      transaction.status ===
      TransactionStatus.PROCESSING
    ) {
      return transaction;
    }

    transaction.markAsProcessing();

    await this.transactionRepository.save(
      transaction,
    );

    return transaction;
  }

  async markAsCompleted(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      transaction.status ===
      TransactionStatus.COMPLETED
    ) {
      return transaction;
    }

    transaction.markAsCompleted();

    await this.transactionRepository.save(
      transaction,
    );

    return transaction;
  }

  async markAsFailed(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      transaction.status ===
      TransactionStatus.FAILED
    ) {
      return transaction;
    }

    transaction.markAsFailed();

    await this.transactionRepository.save(
      transaction,
    );

    return transaction;
  }

  async markAsCompensating(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      transaction.status ===
      TransactionStatus.COMPENSATING
    ) {
      return transaction;
    }

    transaction.markAsCompensating();

    await this.transactionRepository.save(
      transaction,
    );

    return transaction;
  }

  async markAsCompensated(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      transaction.status ===
      TransactionStatus.COMPENSATED
    ) {
      return transaction;
    }

    transaction.markAsCompensated();

    await this.transactionRepository.save(
      transaction,
    );

    return transaction;
  }

  private async getTransaction(
    transactionId: string,
  ): Promise<Transaction> {
    const transaction =
      await this.transactionRepository.findById(
        transactionId,
      );

    if (!transaction) {
      throw new Error(
        `Transaction ${transactionId} not found`,
      );
    }

    return transaction;
  }
}
