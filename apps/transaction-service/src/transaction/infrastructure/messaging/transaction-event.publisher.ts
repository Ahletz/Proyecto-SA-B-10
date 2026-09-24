import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

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

/**
 * UUID (formato v5) derivado de la clave: la misma transición de la
 * misma transacción produce siempre el mismo eventId. Si un evento
 * entrante se reprocesa (reintento o reentrega), lo que se republique
 * trae el eventId de la primera vez y los consumidores lo descartan
 * con su propia idempotencia por eventId.
 */
export function deterministicEventId(key: string): string {
  const hash = createHash('sha1')
    .update(`bank-usac:${key}`)
    .digest();

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

@Injectable()
export class TransactionEventPublisher {
  constructor(
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async publishTransactionCreated(
    transaction: Transaction,
    causationId?: string,
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
        causationId,
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(
      transaction,
      causationId,
    );
  }

  async publishTransactionCompleted(
    transaction: Transaction,
    causationId?: string,
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
        causationId,
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(
      transaction,
      causationId,
    );
  }

  async publishTransactionFailed(
    transaction: Transaction,
    reason: string,
    causationId?: string,
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
        causationId,
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(
      transaction,
      causationId,
    );
  }

  async publishTransactionCompensated(
    transaction: Transaction,
    causationId?: string,
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
        causationId,
      );

    await this.rabbitMqService.publish(
      event.eventType,
      event,
    );

    await this.publishStatusChanged(
      transaction,
      causationId,
    );
  }

  /**
   * Se publica junto con cada evento de la Saga que cambia el
   * estado público (PENDING, APPROVED o FAILED) de la transacción.
   */
  private async publishStatusChanged(
    transaction: Transaction,
    causationId?: string,
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
        causationId,
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
    causationId?: string,
  ): BankEvent<TPayload> {
    return {
      eventId: deterministicEventId(
        `${transaction.transactionId}:` +
          `${eventType}:${transaction.status}`,
      ),
      eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      correlationId:
        transaction.correlationId,
      causationId,
      payload,
    };
  }
}
