import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { BankEvent } from '../../../common/events/bank-event.interface';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import {
  PublicTransactionStatus,
  toPublicStatus,
} from '../../domain/enums/public-transaction-status.enum';
import { RabbitMqService } from './rabbitmq.service';

interface TransactionCreatedPayload {
  transactionId: string;
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  status: TransactionStatus;
}

// Contrato Fase 2 (sección 2.2): lo consume Notification & Audit.
interface TransactionStatusChangedPayload {
  transactionId: string;
  accountId: string;
  estado: PublicTransactionStatus;
  fecha: string;
}

interface TransactionResultPayload {
  transactionId: string;
  status: TransactionStatus;
  reason?: string;
}

@Injectable()
export class TransactionEventPublisher {
  constructor(
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async publishTransactionCreated(
    transaction: Transaction,
  ): Promise<void> {
    const event: BankEvent<TransactionCreatedPayload> =
      this.createEvent(
        'transaction.created',
        transaction,
        {
          transactionId:
            transaction.transactionId,
          sourceAccount:
            transaction.sourceAccount,
          targetAccount:
            transaction.targetAccount,
          amount:
            transaction.amount,
          status:
            transaction.status,
        },
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(transaction);
  }

  async publishTransactionCompleted(
    transaction: Transaction,
  ): Promise<void> {
    const event: BankEvent<TransactionResultPayload> =
      this.createEvent(
        'transaction.completed',
        transaction,
        {
          transactionId:
            transaction.transactionId,
          status:
            transaction.status,
        },
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(transaction);
  }

  async publishTransactionFailed(
    transaction: Transaction,
    reason: string,
  ): Promise<void> {
    const event: BankEvent<TransactionResultPayload> =
      this.createEvent(
        'transaction.failed',
        transaction,
        {
          transactionId:
            transaction.transactionId,
          status:
            transaction.status,
          reason,
        },
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(transaction);
  }

  async publishTransactionCompensated(
    transaction: Transaction,
  ): Promise<void> {
    const event: BankEvent<TransactionResultPayload> =
      this.createEvent(
        'transaction.compensated',
        transaction,
        {
          transactionId:
            transaction.transactionId,
          status:
            transaction.status,
          reason:
            transaction.failureReason ?? undefined,
        },
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(transaction);
  }

  /**
   * Se publica junto con cada evento de la Saga que cambia el
   * estado público (PENDING, APPROVED o FAILED) de la transacción.
   */
  private async publishStatusChanged(
    transaction: Transaction,
  ): Promise<void> {
    const event: BankEvent<TransactionStatusChangedPayload> =
      this.createEvent(
        'transaction.status.changed',
        transaction,
        {
          transactionId:
            transaction.transactionId,
          accountId:
            transaction.sourceAccount,
          estado:
            toPublicStatus(transaction.status),
          fecha:
            transaction.updatedAt.toISOString(),
        },
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );
  }

  private createEvent<TPayload>(
    eventType: string,
    transaction: Transaction,
    payload: TPayload,
  ): BankEvent<TPayload> {
    return {
      eventId: randomUUID(),
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      correlationId:
        transaction.correlationId,
      payload,
    };
  }
}
