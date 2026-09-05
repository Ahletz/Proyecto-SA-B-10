import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { BankEvent } from '../../../common/events/bank-event.interface';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { RabbitMqService } from './rabbitmq.service';

interface TransactionCreatedPayload {
  transactionId: string;
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  status: TransactionStatus;
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
