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

  private async reserve(event: BankEvent<any>): Promise<StepResult> {
    const p = event.payload;
    if (await this.reservations.existsBy({ transactionId: p.transactionId })) return 'skipped';
    const source = await this.accounts.findOneBy({ accountId: p.sourceAccount });
    const target = await this.accounts.findOneBy({ accountId: p.targetAccount });
    const amount = Number(p.amount);
    if (!source || !target || source.status !== 'ACTIVE' || target.status !== 'ACTIVE') {
      await this.emit('account.funds.rejected', event.correlationId, { transactionId: p.transactionId, reason: 'ACCOUNT_NOT_FOUND_OR_INACTIVE' });
      return 'rejected';
    }
    await this.checkAnomaly(source, p.transactionId, event.correlationId);
    const fee = Number(source.feeAmount ?? 0);
    const totalHold = amount + fee;
    const minBalance = Number(source.minBalance ?? 0);
    const available = Number(source.balance) - Number(source.reservedBalance) - minBalance;
    if (available < totalHold) {
      await this.emit('account.funds.rejected', event.correlationId, { transactionId: p.transactionId, reason: 'INSUFFICIENT_FUNDS' });
      return 'rejected';
    }
    source.reservedBalance = (Number(source.reservedBalance) + totalHold).toFixed(2);
    source.lastActivityAt = new Date();
    await this.accounts.save(source);
    await this.reservations.save({
      transactionId: p.transactionId, sourceAccount: p.sourceAccount, targetAccount: p.targetAccount,
      amount: amount.toFixed(2), feeAmount: fee.toFixed(2), status: 'RESERVED', createdAt: new Date(),
    });
    await this.emit('account.funds.reserved', event.correlationId, {
      transactionId: p.transactionId, sourceAccount: p.sourceAccount, targetAccount: p.targetAccount, amount, fee,
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
    const r = await this.reservations.findOneBy({ transactionId: tx });
    if (!r || r.status === 'COMPLETED') return 'skipped';
    const s = await this.accounts.findOneByOrFail({ accountId: r.sourceAccount });
    const t = await this.accounts.findOneByOrFail({ accountId: r.targetAccount });
    const amount = Number(r.amount);
    const fee = Number(r.feeAmount ?? 0);
    const totalHold = amount + fee;
    s.balance = (Number(s.balance) - totalHold).toFixed(2);
    s.reservedBalance = Math.max(0, Number(s.reservedBalance) - totalHold).toFixed(2);
    s.lastActivityAt = new Date();
    t.balance = (Number(t.balance) + amount).toFixed(2);
    t.lastActivityAt = new Date();
    r.status = 'COMPLETED';
    await this.accounts.save([s,t]);
    await this.reservations.save(r);
    await this.emit('account.transfer.completed', event.correlationId, {
      transactionId: tx, sourceAccount: s.accountId, targetAccount: t.accountId, amount, fee,
    });
    return 'done';
  }

  private async release(event: BankEvent<any>): Promise<StepResult> {
    const tx = event.payload.transactionId;
    const r = await this.reservations.findOneBy({ transactionId: tx });
    if (!r || r.status === 'RELEASED') return 'skipped';
    const s = await this.accounts.findOneByOrFail({ accountId: r.sourceAccount });
    const totalHold = Number(r.amount) + Number(r.feeAmount ?? 0);
    s.reservedBalance = Math.max(0, Number(s.reservedBalance) - totalHold).toFixed(2);
    s.lastActivityAt = new Date();
    r.status = 'RELEASED';
    await this.accounts.save(s);
    await this.reservations.save(r);
    await this.emit('account.funds.released', event.correlationId, {
      transactionId: tx, amount: Number(r.amount), fee: Number(r.feeAmount ?? 0), reason: 'SAGA_COMPENSATION',
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
