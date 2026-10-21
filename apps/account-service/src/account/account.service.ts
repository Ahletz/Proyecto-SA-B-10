import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountEntity, AccountType } from './account.entity';
import { ReservationEntity } from './reservation.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { RabbitService } from './rabbit.service';
import { BankEvent } from '../common/bank-event';
import { recordAnomaly, recordDuplicateEvent, timed } from '../common/telemetry';
import { AnomalyDetector } from './anomaly-detector';

type StepResult = 'done' | 'rejected' | 'skipped';

const lockWrite = { mode: 'pessimistic_write' } as const;

// Bloquea las cuentas siempre en el mismo orden (accountId ascendente): dos transferencias en sentidos
// opuestos entre las mismas cuentas ya no pueden esperarse mutuamente (deadlock).
async function lockInOrder(accounts: Repository<AccountEntity>, ids: string[]) {
  const locked = new Map<string, AccountEntity>();
  for (const accountId of [...new Set(ids)].sort()) {
    const a = await accounts.findOne({ where: { accountId }, lock: lockWrite });
    if (a) locked.set(accountId, a);
  }
  return locked;
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  // Umbral configurable por ConfigMap: ANOMALY_MAX_OPS y ANOMALY_WINDOW_MINUTES.
  private readonly anomalies = new AnomalyDetector();
  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ReservationEntity) private readonly reservations: Repository<ReservationEntity>,
    @InjectRepository(ProcessedEventEntity) private readonly processed: Repository<ProcessedEventEntity>,
    private readonly rabbit: RabbitService,
  ) {}

  async create(customerId: string, type: AccountType, initialBalance = 0, minBalance?: number, feeAmount?: number | null) {
    if (!['MONETARY','SAVINGS'].includes(type)) throw new Error('Invalid account type');
    if (!Number.isFinite(initialBalance) || initialBalance < 0) throw new Error('Invalid initialBalance');

    const resolvedMinBalance = (minBalance !== undefined && minBalance !== null)
      ? minBalance
      : (type === 'SAVINGS' ? 50 : 0);
    if (!Number.isFinite(resolvedMinBalance) || resolvedMinBalance < 0) throw new Error('Invalid minBalance');

    if (feeAmount !== undefined && feeAmount !== null && (!Number.isFinite(feeAmount) || feeAmount < 0)) {
      throw new Error('Invalid feeAmount');
    }

    const a = this.accounts.create({
      accountId: randomUUID(),
      customerId,
      type,
      balance: initialBalance.toFixed(2),
      reservedBalance: '0.00',
      minBalance: resolvedMinBalance.toFixed(2),
      feeAmount: (feeAmount !== undefined && feeAmount !== null) ? feeAmount.toFixed(2) : null,
      status: 'ACTIVE',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });
    await this.accounts.save(a);
    await this.emit('account.created', randomUUID(), {
      accountId: a.accountId, customerId, type,
      balance: Number(a.balance), minBalance: Number(a.minBalance),
      feeAmount: a.feeAmount !== null ? Number(a.feeAmount) : null,
      status: a.status,
    });
    return this.toDto(a);
  }

  async list(customerId: string) { return (await this.accounts.find({ where: { customerId } })).map(a => this.toDto(a)); }
  async get(accountId: string) { const a = await this.accounts.findOneBy({ accountId }); if (!a) throw new Error('Account not found'); return this.toDto(a); }

  async handle(event: BankEvent<any>) {
    if (await this.processed.existsBy({ eventId: event.eventId })) {
      recordDuplicateEvent(event.eventType);
      return;
    }
    // Un rechazo de negocio (sin fondos, cuenta inactiva) no es una falla técnica.
    const classify = (r: StepResult) => (r === 'rejected' ? 'business_rejection' : 'success');
    if (event.eventType === 'transaction.created') await timed('account.reserve', () => this.reserve(event), classify);
    else if (event.eventType === 'payment.approved') await timed('account.complete', () => this.complete(event), classify);
    else if (event.eventType === 'payment.rejected') await timed('account.release', () => this.release(event), classify);
    await this.processed.save({ eventId: event.eventId, eventType: event.eventType, correlationId: event.correlationId, processedAt: new Date() });
  }

  // Cada paso de la Saga corre en UNA transacción con las filas bloqueadas (SELECT ... FOR UPDATE).
  // Antes se leía la cuenta, se calculaba el saldo en memoria y se guardaba la entidad completa sin
  // bloqueo: con prefetch 10 y varias réplicas dos eventos de la misma cuenta se pisaban (actualización
  // perdida: en la prueba de estrés del 21 oct faltaron Q7) y, con transferencias en sentidos opuestos,
  // Postgres abortaba por deadlock (40P01) y los eventos terminaban en la DLQ. Las dos cuentas se
  // bloquean siempre en el mismo orden (por accountId) y los eventos se publican después del commit.
  private async reserve(event: BankEvent<any>): Promise<StepResult> {
    const p = event.payload;
    const amount = Number(p.amount);
    const outcome = await this.accounts.manager.transaction(async (m) => {
      const accounts = m.getRepository(AccountEntity);
      const reservations = m.getRepository(ReservationEntity);
      const source = await accounts.findOne({ where: { accountId: p.sourceAccount }, lock: lockWrite });
      // Con la cuenta origen bloqueada, dos entregas del mismo evento no pueden reservar dos veces.
      if (await reservations.existsBy({ transactionId: p.transactionId })) return { kind: 'skipped' as const };
      const target = await accounts.findOneBy({ accountId: p.targetAccount });
      if (!source || !target || source.status !== 'ACTIVE' || target.status !== 'ACTIVE') {
        return { kind: 'rejected' as const, reason: 'ACCOUNT_NOT_FOUND_OR_INACTIVE', source };
      }
      const fee = Number(source.feeAmount ?? 0);
      const totalHold = amount + fee;
      const minBalance = Number(source.minBalance ?? 0);
      const available = Number(source.balance) - Number(source.reservedBalance) - minBalance;
      if (available < totalHold) return { kind: 'rejected' as const, reason: 'INSUFFICIENT_FUNDS', source };
      source.reservedBalance = (Number(source.reservedBalance) + totalHold).toFixed(2);
      source.lastActivityAt = new Date();
      await accounts.save(source);
      await reservations.save({
        transactionId: p.transactionId, sourceAccount: p.sourceAccount, targetAccount: p.targetAccount,
        amount: amount.toFixed(2), feeAmount: fee.toFixed(2), status: 'RESERVED', createdAt: new Date(),
      });
      return { kind: 'reserved' as const, fee, source };
    });

    if (outcome.kind === 'skipped') return 'skipped';
    if (outcome.source) await this.checkAnomaly(outcome.source, p.transactionId, event.correlationId);
    if (outcome.kind === 'rejected') {
      await this.emit('account.funds.rejected', event.correlationId, { transactionId: p.transactionId, reason: outcome.reason });
      return 'rejected';
    }
    await this.emit('account.funds.reserved', event.correlationId, {
      transactionId: p.transactionId, sourceAccount: p.sourceAccount, targetAccount: p.targetAccount, amount, fee: outcome.fee,
    });
    return 'done';
  }

  // Actividad anómala: más de N operaciones en M minutos desde la misma cuenta.
  // Publica account.anomaly.detected (lo consumen Notification y Audit) y deja un log WARN.
  private async checkAnomaly(source: AccountEntity, transactionId: string, correlationId: string) {
    const anomaly = this.anomalies.record(source.accountId);
    if (!anomaly) return;
    recordAnomaly();
    this.logger.warn({
      message: 'Actividad anómala detectada en cuenta',
      event: 'account.anomaly.detected',
      accountId: source.accountId,
      operationCount: anomaly.operationCount,
      threshold: anomaly.threshold,
      windowMinutes: anomaly.windowMinutes,
    });
    await this.emit('account.anomaly.detected', correlationId, {
      accountId: source.accountId,
      customerId: source.customerId,
      transactionId,
      reason: 'HIGH_FREQUENCY',
      operationCount: anomaly.operationCount,
      threshold: anomaly.threshold,
      windowMinutes: anomaly.windowMinutes,
      detectedAt: new Date().toISOString(),
    });
  }

  private async complete(event: BankEvent<any>): Promise<StepResult> {
    const tx = event.payload.transactionId;
    const done = await this.accounts.manager.transaction(async (m) => {
      const accounts = m.getRepository(AccountEntity);
      const reservations = m.getRepository(ReservationEntity);
      const r = await reservations.findOne({ where: { transactionId: tx }, lock: lockWrite });
      if (!r || r.status === 'COMPLETED') return null;
      const locked = await lockInOrder(accounts, [r.sourceAccount, r.targetAccount]);
      const s = locked.get(r.sourceAccount);
      const t = locked.get(r.targetAccount);
      if (!s || !t) throw new Error(`Cuenta de la reserva ${tx} no encontrada`);
      const amount = Number(r.amount);
      const fee = Number(r.feeAmount ?? 0);
      const totalHold = amount + fee;
      s.balance = (Number(s.balance) - totalHold).toFixed(2);
      s.reservedBalance = Math.max(0, Number(s.reservedBalance) - totalHold).toFixed(2);
      s.lastActivityAt = new Date();
      t.balance = (Number(t.balance) + amount).toFixed(2);
      t.lastActivityAt = new Date();
      r.status = 'COMPLETED';
      await accounts.save([s, t]);
      await reservations.save(r);
      return { sourceAccount: s.accountId, targetAccount: t.accountId, amount, fee };
    });
    if (!done) return 'skipped';
    await this.emit('account.transfer.completed', event.correlationId, { transactionId: tx, ...done });
    return 'done';
  }

  private async release(event: BankEvent<any>): Promise<StepResult> {
    const tx = event.payload.transactionId;
    const released = await this.accounts.manager.transaction(async (m) => {
      const accounts = m.getRepository(AccountEntity);
      const reservations = m.getRepository(ReservationEntity);
      const r = await reservations.findOne({ where: { transactionId: tx }, lock: lockWrite });
      if (!r || r.status === 'RELEASED') return null;
      const s = await accounts.findOne({ where: { accountId: r.sourceAccount }, lock: lockWrite });
      if (!s) throw new Error(`Cuenta de la reserva ${tx} no encontrada`);
      const totalHold = Number(r.amount) + Number(r.feeAmount ?? 0);
      s.reservedBalance = Math.max(0, Number(s.reservedBalance) - totalHold).toFixed(2);
      s.lastActivityAt = new Date();
      r.status = 'RELEASED';
      await accounts.save(s);
      await reservations.save(r);
      return { amount: Number(r.amount), fee: Number(r.feeAmount ?? 0) };
    });
    if (!released) return 'skipped';
    await this.emit('account.funds.released', event.correlationId, {
      transactionId: tx, ...released, reason: 'SAGA_COMPENSATION',
    });
    return 'done';
  }


  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deactivateInactive() {
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const list = await this.accounts.createQueryBuilder('a').where('a.status = :s', {s:'ACTIVE'}).andWhere('a.lastActivityAt < :d', {d:sixMonthsAgo}).andWhere('CAST(a.balance AS numeric) < :b', {b:50}).getMany();
    for (const a of list) { a.status='INACTIVE'; await this.accounts.save(a); await this.emit('account.deactivated', randomUUID(), {accountId:a.accountId, customerId:a.customerId, reason:'INACTIVE_6_MONTHS_BALANCE_UNDER_Q50'}); }
    return list.length;
  }

  private async emit(type: string, correlationId: string, payload: any) {
    await this.rabbit.publish({ eventId: randomUUID(), eventType: type, version: 1, timestamp: new Date().toISOString(), correlationId, payload });
  }

  private toDto(a: AccountEntity) {
    return {
      accountId: a.accountId, customerId: a.customerId, type: a.type,
      balance: Number(a.balance), reservedBalance: Number(a.reservedBalance),
      availableBalance: Number(a.balance) - Number(a.reservedBalance),
      minBalance: Number(a.minBalance),
      feeAmount: (a.feeAmount !== null && a.feeAmount !== undefined) ? Number(a.feeAmount) : null,
      status: a.status, lastActivityAt: a.lastActivityAt,
    };
  }
}
