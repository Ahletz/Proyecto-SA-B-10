import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import type { ConsumeMessage } from 'amqplib';

import { BankEvent } from '../../../common/events/bank-event.interface';
import { CreateTransactionService } from '../../application/services/create-transaction.service';
import { UpdateTransactionStateService } from '../../application/services/update-transaction-state.service';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';
import { TransactionEventPublisher } from '../../infrastructure/messaging/transaction-event.publisher';
import { EventIdempotencyService } from '../../infrastructure/messaging/event-idempotency.service';

interface TransferRequestedPayload {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
}

interface TransactionReferencePayload {
  transactionId: string;
  reason?: string;
}

type TransactionEventPayload =
  | TransferRequestedPayload
  | TransactionReferencePayload;

@Injectable()
export class TransactionEventsConsumer
  implements OnModuleInit
{
  private readonly logger =
    new Logger(
      TransactionEventsConsumer.name,
    );

  constructor(
    private readonly rabbitMqService:
      RabbitMqService,

    private readonly createTransactionService:
      CreateTransactionService,

    private readonly updateTransactionStateService:
      UpdateTransactionStateService,

    private readonly transactionEventPublisher:
      TransactionEventPublisher,

    private readonly eventIdempotencyService:
      EventIdempotencyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMqService.subscribe(
      [
        'transaction.transfer.requested',

        'account.funds.reserved',
        'account.funds.rejected',

        'payment.rejected',

        'account.transfer.completed',
        'account.transfer.failed',

        'account.funds.released',
      ],
      async (message) => {
        await this.handleMessage(message);
      },
    );

    this.logger.log(
      'Transaction event consumer initialized',
    );
  }

  private async handleMessage(
    message: ConsumeMessage,
  ): Promise<void> {
    const event =
      this.parseEvent(message);

    this.validateEnvelope(event);

    const alreadyProcessed =
      await this.eventIdempotencyService
        .hasBeenProcessed(
          event.eventId,
        );

    if (alreadyProcessed) {
      this.logger.warn(
        `Duplicate event ignored ` +
          `[eventId=${event.eventId}]`,
      );

      return;
    }

    this.logger.log(
      `Processing ${event.eventType} ` +
        `[eventId=${event.eventId}] ` +
        `[correlationId=${event.correlationId}]`,
    );

    switch (event.eventType) {
      case 'transaction.transfer.requested':
        await this.handleTransferRequested(
          event as BankEvent<TransferRequestedPayload>,
        );
        break;

      case 'account.funds.reserved':
        await this.handleFundsReserved(
          event as BankEvent<TransactionReferencePayload>,
        );
        break;

      case 'account.funds.rejected':
        await this.handleFundsRejected(
          event as BankEvent<TransactionReferencePayload>,
        );
        break;

      case 'payment.rejected':
        await this.handlePaymentRejected(
          event as BankEvent<TransactionReferencePayload>,
        );
        break;

      case 'account.transfer.completed':
        await this.handleTransferCompleted(
          event as BankEvent<TransactionReferencePayload>,
        );
        break;

      case 'account.transfer.failed':
        await this.handleTransferFailed(
          event as BankEvent<TransactionReferencePayload>,
        );
        break;

      case 'account.funds.released':
        await this.handleFundsReleased(
          event as BankEvent<TransactionReferencePayload>,
        );
        break;

      default:
        throw new Error(
          `Unsupported event: ${event.eventType}`,
        );
    }

    await this.eventIdempotencyService
      .markAsProcessed(event);
  }

  private async handleTransferRequested(
    event: BankEvent<TransferRequestedPayload>,
  ): Promise<void> {
    this.validateTransferRequested(event);

    const transaction =
      await this.createTransactionService
        .execute({
          sourceAccount:
            event.payload.sourceAccount,

          targetAccount:
            event.payload.targetAccount,

          amount:
            event.payload.amount,

          correlationId:
            event.correlationId,
        });

    await this.transactionEventPublisher
      .publishTransactionCreated(
        transaction,
      );

    this.logger.log(
      `Transaction ${transaction.transactionId} created`,
    );
  }

  private async handleFundsReserved(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const transaction =
      await this.updateTransactionStateService
        .markAsProcessing(
          event.payload.transactionId,
        );

    this.logger.log(
      `Transaction ${transaction.transactionId} ` +
        `is PROCESSING`,
    );
  }

  private async handleFundsRejected(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const transaction =
      await this.updateTransactionStateService
        .markAsFailed(
          event.payload.transactionId,
        );

    await this.transactionEventPublisher
      .publishTransactionFailed(
        transaction,
        event.payload.reason ??
          'FUNDS_REJECTED',
      );
  }

  private async handlePaymentRejected(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const transaction =
      await this.updateTransactionStateService
        .markAsCompensating(
          event.payload.transactionId,
        );

    this.logger.warn(
      `Transaction ${transaction.transactionId} ` +
        `is COMPENSATING`,
    );
  }

  private async handleTransferCompleted(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const transaction =
      await this.updateTransactionStateService
        .markAsCompleted(
          event.payload.transactionId,
        );

    await this.transactionEventPublisher
      .publishTransactionCompleted(
        transaction,
      );
  }

  private async handleTransferFailed(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const transaction =
      await this.updateTransactionStateService
        .markAsFailed(
          event.payload.transactionId,
        );

    await this.transactionEventPublisher
      .publishTransactionFailed(
        transaction,
        event.payload.reason ??
          'TRANSFER_FAILED',
      );
  }

  private async handleFundsReleased(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const transaction =
      await this.updateTransactionStateService
        .markAsCompensated(
          event.payload.transactionId,
        );

    await this.transactionEventPublisher
      .publishTransactionCompensated(
        transaction,
      );
  }

  private parseEvent(
    message: ConsumeMessage,
  ): BankEvent<TransactionEventPayload> {
    return JSON.parse(
      message.content.toString('utf8'),
    ) as BankEvent<TransactionEventPayload>;
  }

  private validateEnvelope(
    event: BankEvent<TransactionEventPayload>,
  ): void {
    if (!event.eventId) {
      throw new Error(
        'eventId is required',
      );
    }

    if (!event.eventType) {
      throw new Error(
        'eventType is required',
      );
    }

    if (!event.correlationId) {
      throw new Error(
        'correlationId is required',
      );
    }

    if (!event.payload) {
      throw new Error(
        'payload is required',
      );
    }
  }

  private validateTransferRequested(
    event: BankEvent<TransferRequestedPayload>,
  ): void {
    if (!event.payload.sourceAccount) {
      throw new Error(
        'sourceAccount is required',
      );
    }

    if (!event.payload.targetAccount) {
      throw new Error(
        'targetAccount is required',
      );
    }

    if (
      typeof event.payload.amount !==
        'number' ||
      event.payload.amount <= 0
    ) {
      throw new Error(
        'amount must be greater than zero',
      );
    }
  }

  private validateTransactionReference(
    event: BankEvent<TransactionReferencePayload>,
  ): void {
    if (!event.payload.transactionId) {
      throw new Error(
        'transactionId is required',
      );
    }
  }
}
