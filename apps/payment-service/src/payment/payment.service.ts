import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PaymentEntity } from './payment.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { RabbitService } from './rabbit.service';
import { BankEvent } from '../common/bank-event';

type ExternalResult = 'SUCCESS' | 'FAILURE' | 'TIMEOUT';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity) private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(ProcessedEventEntity) private readonly processed: Repository<ProcessedEventEntity>,
    private readonly rabbit: RabbitService,
    private readonly config: ConfigService,
  ) {}

  async handle(e: BankEvent<any>) {
    if (await this.processed.existsBy({ eventId: e.eventId })) return;
    const p = e.payload;
    const existing = await this.payments.findOneBy({ transactionId: p.transactionId });

    if (!existing) {
      const amount = Number(p.amount);
      const max = Number(this.config.get('PAYMENT_MAX_AMOUNT', '1000000'));
      let status: 'APPROVED' | 'REJECTED' = 'APPROVED';
      let reason: string | null = null;

      if (!Number.isFinite(amount) || amount <= 0) {
        status = 'REJECTED';
        reason = 'INVALID_AMOUNT';
      } else if (amount > max) {
        status = 'REJECTED';
        reason = 'PAYMENT_LIMIT_EXCEEDED';
      } else {
        // Simulación de un sistema de pago externo (Fase 2)
        const externalResult = await this.simulateExternalProcessor();
        if (externalResult === 'FAILURE') {
          status = 'REJECTED';
          reason = 'EXTERNAL_FAILURE';
        } else if (externalResult === 'TIMEOUT') {
          status = 'REJECTED';
          reason = 'TIMEOUT';
        }
      }

      const payment = this.payments.create({
        paymentId: randomUUID(),
        transactionId: p.transactionId,
        amount: amount.toFixed(2),
        status,
        reason,
        correlationId: e.correlationId,
        createdAt: new Date(),
      });
      await this.payments.save(payment);

      await this.rabbit.publish({
        eventId: randomUUID(),
        eventType: status === 'APPROVED' ? 'payment.approved' : 'payment.rejected',
        version: 1,
        timestamp: new Date().toISOString(),
        correlationId: e.correlationId,
        payload: { paymentId: payment.paymentId, transactionId: p.transactionId, status, reason },
      });
    }

    await this.processed.save({
      eventId: e.eventId,
      eventType: e.eventType,
      correlationId: e.correlationId,
      processedAt: new Date(),
    });
  }

  /**
   * Simula la respuesta de un procesador de pagos externo.
   * Tasas configurables por variable de entorno; el resto de las veces es SUCCESS.
   */
  private async simulateExternalProcessor(): Promise<ExternalResult> {
    const failureRate = Number(this.config.get('PAYMENT_SIMULATE_FAILURE_RATE', '0.1'));
    const timeoutRate = Number(this.config.get('PAYMENT_SIMULATE_TIMEOUT_RATE', '0.05'));
    const roll = Math.random();

    if (roll < timeoutRate) {
      const delayMs = Number(this.config.get('PAYMENT_SIMULATE_TIMEOUT_MS', '3000'));
      await this.sleep(delayMs);
      return 'TIMEOUT';
    }
    if (roll < timeoutRate + failureRate) {
      return 'FAILURE';
    }
    return 'SUCCESS';
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async list() {
    return this.payments.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async getByTransaction(transactionId: string) {
    return this.payments.findOneBy({ transactionId });
  }
}
