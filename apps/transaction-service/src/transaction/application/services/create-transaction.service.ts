import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { InterbankState } from '../../domain/enums/interbank-state.enum';
import { TransactionRepository } from '../ports/transaction.repository';

export interface CreateTransactionCommand {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  correlationId: string;
  // Depósito interbancario: banco destino (BANKnn); targetAccount es la cuenta en ese banco.
  destinationBankCode?: string;
}

export interface RecordIncomingInterbankCommand {
  originBankCode: string | null;
  originAccount: string | null;
  accountId: string;
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
      null,
      command.destinationBankCode ?? null,
      command.destinationBankCode
        ? InterbankState.PENDING
        : null,
    );

    await this.transactionRepository.save(transaction);

    return transaction;
  }

  /**
   * Depósito interbancario recibido: Account ya lo acreditó, así que solo se
   * registra como COMPLETED / ACCEPTED para el historial. Idempotente por
   * correlationId (Account puede repetir el evento).
   */
  async recordIncomingInterbank(
    command: RecordIncomingInterbankCommand,
  ): Promise<{ transaction: Transaction; created: boolean }> {
    const existingTransaction =
      await this.transactionRepository.findByCorrelationId(
        command.correlationId,
      );

    if (existingTransaction) {
      return { transaction: existingTransaction, created: false };
    }

    const now = new Date();
    const originBankCode = command.originBankCode ?? 'EXTERNAL';

    const transaction = new Transaction(
      randomUUID(),
      command.originAccount || originBankCode,
      command.accountId,
      command.amount,
      TransactionStatus.COMPLETED,
      command.correlationId,
      now,
      now,
      null,
      null,
      InterbankState.ACCEPTED,
      originBankCode,
    );

    await this.transactionRepository.save(transaction);

    return { transaction, created: true };
  }
}
