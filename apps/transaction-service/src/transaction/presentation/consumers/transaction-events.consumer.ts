import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import type { ConsumeMessage } from 'amqplib';

import { BankEvent } from '../../../common/events/bank-event.interface';
import { CreateTransactionService } from '../../application/services/create-transaction.service';
import { UpdateTransactionStateService } from '../../application/services/update-transaction-state.service';
import { CustomerKycService } from '../../application/services/customer-kyc.service';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';
import { TransactionEventPublisher } from '../../infrastructure/messaging/transaction-event.publisher';
import { EventIdempotencyService } from '../../infrastructure/messaging/event-idempotency.service';

interface TransferRequestedPayload {
  sourceAccount: string;
  targetAccount: string;
  amount: number;
  // customerId del cliente autenticado (lo agrega el Gateway)
  requestedBy?: string;
}

interface TransactionReferencePayload {
  transactionId: string;
  reason?: string;
}

// Contrato Fase 2 (sección 2.2): lo publica Customer Service.
interface KycStatusChangedPayload {
  customerId: string;
  estadoAnterior?: string;
  estadoNuevo: string;
}

type TransactionEventPayload =
  | TransferRequestedPayload
  | TransactionReferencePayload
  | KycStatusChangedPayload;

export const KYC_NOT_VERIFIED = 'KYC_NOT_VERIFIED';

/**
 * Payment manda motivos propios (TIMEOUT, EXTERNAL_FAILURE, ...).
 * En Transaction se guardan con prefijo PAYMENT_ para que en el
 * historial se distinga qué participante de la Saga falló.
 */
export function toPaymentFailureReason(
  reason: string | undefined,
): string {
  if (!reason) {
    return 'PAYMENT_REJECTED';
  }

  return reason.startsWith('PAYMENT_')
    ? reason
    : `PAYMENT_${reason}`;
}

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

    private readonly customerKycService:
      CustomerKycService,
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

        'customer.kyc.status.changed',
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

      case 'customer.kyc.status.changed':
        await this.handleKycStatusChanged(
          event as BankEvent<KycStatusChangedPayload>,
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

    // Reintento de un evento cuya Saga ya avanzó: no se vuelve a decidir.
    if (
      transaction.status !==
      TransactionStatus.PENDING
    ) {
      this.logger.warn(
        `Transaction ${transaction.transactionId} ` +
          `already ${transaction.status}, skipping`,
      );

      return;
    }

    const kycVerified =
      await this.customerKycService.isVerified(
        event.payload.requestedBy,
      );

    if (!kycVerified) {
      const failed =
        await this.updateTransactionStateService
          .markAsFailed(
            transaction.transactionId,
            KYC_NOT_VERIFIED,
          );

      await this.transactionEventPublisher
        .publishTransactionFailed(
          failed,
          KYC_NOT_VERIFIED,
          event.eventId,
        );

      this.logger.warn(
        `Transaction ${transaction.transactionId} ` +
          `FAILED: customer ${event.payload.requestedBy ?? '<unknown>'} ` +
          `is not KYC VERIFIED`,
      );

      return;
    }

    await this.transactionEventPublisher
      .publishTransactionCreated(
        transaction,
        event.eventId,
      );

    this.logger.log(
      `Transaction ${transaction.transactionId} created`,
    );
  }

  private async handleKycStatusChanged(
    event: BankEvent<KycStatusChangedPayload>,
  ): Promise<void> {
    const changedAt = new Date(event.timestamp);

    const applied =
      await this.customerKycService
        .applyStatusChange(
          event.payload.customerId,
          event.payload.estadoNuevo,
          Number.isNaN(changedAt.getTime())
            ? new Date()
            : changedAt,
        );

    this.logger.log(
      `KYC of ${event.payload.customerId} ` +
        (applied
          ? `is now ${event.payload.estadoNuevo}`
          : `unchanged (stale event)`),
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

    if (
      !this.reachedStatus(
        transaction,
        TransactionStatus.PROCESSING,
        event,
      )
    ) {
      return;
    }

    this.logger.log(
      `Transaction ${transaction.transactionId} ` +
        `is PROCESSING`,
    );
  }

  private async handleFundsRejected(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const reason =
      event.payload.reason ??
      'FUNDS_REJECTED';

    const transaction =
      await this.updateTransactionStateService
        .markAsFailed(
          event.payload.transactionId,
          reason,
        );

    if (
      !this.reachedStatus(
        transaction,
        TransactionStatus.FAILED,
        event,
      )
    ) {
      return;
    }

    await this.transactionEventPublisher
      .publishTransactionFailed(
        transaction,
        reason,
        event.eventId,
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
          toPaymentFailureReason(
            event.payload.reason,
          ),
        );

    if (
      !this.reachedStatus(
        transaction,
        TransactionStatus.COMPENSATING,
        event,
      )
    ) {
      return;
    }

    this.logger.warn(
      `Transaction ${transaction.transactionId} ` +
        `is COMPENSATING (${transaction.failureReason})`,
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

    if (
      !this.reachedStatus(
        transaction,
        TransactionStatus.COMPLETED,
        event,
      )
    ) {
      return;
    }

    await this.transactionEventPublisher
      .publishTransactionCompleted(
        transaction,
        event.eventId,
      );
  }

  private async handleTransferFailed(
    event: BankEvent<TransactionReferencePayload>,
  ): Promise<void> {
    this.validateTransactionReference(event);

    const reason =
      event.payload.reason ??
      'TRANSFER_FAILED';

    const transaction =
      await this.updateTransactionStateService
        .markAsFailed(
          event.payload.transactionId,
          reason,
        );

    if (
      !this.reachedStatus(
        transaction,
        TransactionStatus.FAILED,
        event,
      )
    ) {
      return;
    }

    await this.transactionEventPublisher
      .publishTransactionFailed(
        transaction,
        reason,
        event.eventId,
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

    if (
      !this.reachedStatus(
        transaction,
        TransactionStatus.COMPENSATED,
        event,
      )
    ) {
      return;
    }

    await this.transactionEventPublisher
      .publishTransactionCompensated(
        transaction,
        event.eventId,
      );
  }

  /**
   * false si el evento llegó tarde: la Saga ya había avanzado a otro
   * estado y no hay nada que publicar.
   */
  private reachedStatus(
    transaction: Transaction,
    expected: TransactionStatus,
    event: BankEvent,
  ): boolean {
    if (transaction.status === expected) {
      return true;
    }

    this.logger.warn(
      `Stale ${event.eventType} ignored: ` +
        `transaction ${transaction.transactionId} ` +
        `is already ${transaction.status} ` +
        `[eventId=${event.eventId}]`,
    );

    return false;
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
