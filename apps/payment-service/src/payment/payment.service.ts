import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PaymentEntity } from './payment.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { RabbitService } from './rabbit.service';
import { BankEvent } from '../common/bank-event';
import { recordDuplicateEvent, timed } from '../common/telemetry';
import { mergeSimulation, parseSimulationPatch, SimulationSettings } from './simulation-config';

type ExternalResult = 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
type PaymentOutcome = { status: 'APPROVED' | 'REJECTED'; reason: string | null };

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  // Ajustes de simulación cambiados en caliente (POST /internal/payment-simulation).
  // Tienen prioridad sobre las variables de entorno; se pierden al reiniciar el pod.
  private overrides: Partial<SimulationSettings> = {};

  constructor(
    @InjectRepository(PaymentEntity) private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(ProcessedEventEntity) private readonly processed: Repository<ProcessedEventEntity>,
    private readonly rabbit: RabbitService,
    private readonly config: ConfigService,
  ) {}

  async handle(e: BankEvent<any>) {
    if (await this.processed.existsBy({ eventId: e.eventId })) {
      recordDuplicateEvent(e.eventType);
      return;
    }
    const p = e.payload;
    const existing = await this.payments.findOneBy({ transactionId: p.transactionId });

    if (!existing) {
      // Rechazos por reglas de negocio (monto inválido o sobre el límite) son business_rejection;
      // las fallas del procesador externo (FAILURE/TIMEOUT) cuentan como technical_error.
      const { status, reason } = await timed(
        'payment.process',
        () => this.decide(p),
        (r) => (r.status === 'APPROVED' ? 'success' : r.reason === 'EXTERNAL_FAILURE' || r.reason === 'TIMEOUT' ? 'technical_error' : 'business_rejection'),
      );

      const payment = this.payments.create({
        paymentId: randomUUID(),
        transactionId: p.transactionId,
        amount: Number(p.amount).toFixed(2),
        status,
        reason,
        correlationId: e.correlationId,
        createdAt: new Date(),
      });
      await this.payments.save(payment);

      if (status === 'REJECTED') {
        this.logger.warn({ message: 'Pago rechazado', event: 'payment.rejected', transactionId: p.transactionId, reason });
      }

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

  private async decide(p: any): Promise<PaymentOutcome> {
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
    return { status, reason };
  }

  /** Ajustes vigentes: variables de entorno más los cambios hechos en caliente. */
  getSimulation() {
    return { ...this.effectiveSimulation(), overrides: { ...this.overrides } };
  }

  /** Cambia la simulación sin redeploy. Devuelve los errores de validación (vacío si se aplicó). */
  setSimulation(input: unknown): { errors: string[] } {
    const { patch, errors } = parseSimulationPatch(input);
    if (errors.length) return { errors };
    const merged = mergeSimulation(this.effectiveSimulation(), patch);
    if (merged.errors.length) return { errors: merged.errors };
    this.overrides = { ...this.overrides, ...patch };
    this.logger.warn({ message: 'Simulación del procesador externo modificada', event: 'payment.simulation.changed', ...patch });
    return { errors: [] };
  }

  resetSimulation() {
    this.overrides = {};
    this.logger.warn({ message: 'Simulación del procesador externo restablecida', event: 'payment.simulation.reset' });
  }

  private effectiveSimulation(): SimulationSettings {
    return {
      failureRate: Number(this.config.get('PAYMENT_SIMULATE_FAILURE_RATE', '0.1')),
      timeoutRate: Number(this.config.get('PAYMENT_SIMULATE_TIMEOUT_RATE', '0.05')),
      timeoutMs: Number(this.config.get('PAYMENT_SIMULATE_TIMEOUT_MS', '3000')),
      latencyMs: Number(this.config.get('PAYMENT_SIMULATE_LATENCY_MS', '0')),
      ...this.overrides,
    };
  }

  /**
   * Simula la respuesta de un procesador de pagos externo.
   * Tasas y latencias configurables por variable de entorno o en caliente; el resto de las veces es SUCCESS.
   */
  private async simulateExternalProcessor(): Promise<ExternalResult> {
    const { failureRate, timeoutRate, timeoutMs, latencyMs } = this.effectiveSimulation();
    if (latencyMs > 0) await this.sleep(latencyMs);
    const roll = Math.random();

    if (roll < timeoutRate) {
      await this.sleep(timeoutMs);
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
