import { Injectable } from '@nestjs/common';

import { TransactionRepository } from '../ports/transaction.repository';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';

/**
 * Avance de la Saga. Un evento que pide un estado de una etapa igual o
 * anterior a la actual llegó tarde (reentrega o reintento después de que
 * la Saga avanzó): se ignora en vez de fallar y acabar en la DLQ.
 */
const SAGA_STAGE: Record<TransactionStatus, number> = {
  [TransactionStatus.PENDING]: 0,
  [TransactionStatus.PROCESSING]: 1,
  [TransactionStatus.COMPENSATING]: 2,
  [TransactionStatus.COMPLETED]: 3,
  [TransactionStatus.FAILED]: 3,
  [TransactionStatus.COMPENSATED]: 3,
};

function isStale(
  current: TransactionStatus,
  target: TransactionStatus,
): boolean {
  return SAGA_STAGE[current] >= SAGA_STAGE[target];
}

/**
 * Cada markAs* devuelve la transacción tal como quedó. Si el evento era
 * tardío su estado no será el pedido: el llamador no debe publicar nada.
 */
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
      isStale(
        transaction.status,
        TransactionStatus.PROCESSING,
      )
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
      isStale(
        transaction.status,
        TransactionStatus.COMPLETED,
      )
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
    reason?: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      isStale(
        transaction.status,
        TransactionStatus.FAILED,
      )
    ) {
      return transaction;
    }

    transaction.markAsFailed(reason);

    await this.transactionRepository.save(
      transaction,
    );

    return transaction;
  }

  async markAsCompensating(
    transactionId: string,
    reason?: string,
  ): Promise<Transaction> {
    const transaction =
      await this.getTransaction(transactionId);

    if (
      isStale(
        transaction.status,
        TransactionStatus.COMPENSATING,
      )
    ) {
      return transaction;
    }

    transaction.markAsCompensating(reason);

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
      isStale(
        transaction.status,
        TransactionStatus.COMPENSATED,
      )
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
