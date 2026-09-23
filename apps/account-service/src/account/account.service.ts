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

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ReservationEntity) private readonly reservations: Repository<ReservationEntity>,
    @InjectRepository(ProcessedEventEntity) private readonly processed: Repository<ProcessedEventEntity>,
    private readonly rabbit: RabbitService,
  ) {}

  async create(customerId: string, type: AccountType, initialBalance = 0) {
    if (!['MONETARY','SAVINGS'].includes(type)) throw new Error('Invalid account type');
    if (!Number.isFinite(initialBalance) || initialBalance < 0) throw new Error('Invalid initialBalance');
    const a = this.accounts.create({ accountId: randomUUID(), customerId, type, balance: initialBalance.toFixed(2), reservedBalance: '0.00', status: 'ACTIVE', createdAt: new Date(), lastActivityAt: new Date() });
    await this.accounts.save(a);
    await this.emit('account.created', randomUUID(), { accountId: a.accountId, customerId, type, balance: Number(a.balance), status: a.status });
    return this.toDto(a);
  }
  async list(customerId: string) { return (await this.accounts.find({ where: { customerId } })).map(a => this.toDto(a)); }
  async get(accountId: string) { const a = await this.accounts.findOneBy({ accountId }); if (!a) throw new Error('Account not found'); return this.toDto(a); }

  async handle(event: BankEvent<any>) {
    if (await this.processed.existsBy({ eventId: event.eventId })) return;
    if (event.eventType === 'transaction.created') await this.reserve(event);
    else if (event.eventType === 'payment.approved') await this.complete(event);
    else if (event.eventType === 'payment.rejected') await this.release(event);
    await this.processed.save({ eventId: event.eventId, eventType: event.eventType, correlationId: event.correlationId, processedAt: new Date() });
  }

  private async reserve(event: BankEvent<any>) {
    const p = event.payload;
    if (await this.reservations.existsBy({ transactionId: p.transactionId })) return;
    const source = await this.accounts.findOneBy({ accountId: p.sourceAccount });
    const target = await this.accounts.findOneBy({ accountId: p.targetAccount });
    const amount = Number(p.amount);
    if (!source || !target || source.status !== 'ACTIVE' || target.status !== 'ACTIVE') {
      return this.emit('account.funds.rejected', event.correlationId, { transactionId: p.transactionId, reason: 'ACCOUNT_NOT_FOUND_OR_INACTIVE' });
    }
    const available = Number(source.balance) - Number(source.reservedBalance);
    if (available < amount) return this.emit('account.funds.rejected', event.correlationId, { transactionId: p.transactionId, reason: 'INSUFFICIENT_FUNDS' });
    source.reservedBalance = (Number(source.reservedBalance) + amount).toFixed(2); source.lastActivityAt = new Date();
    await this.accounts.save(source);
    await this.reservations.save({ transactionId: p.transactionId, sourceAccount: p.sourceAccount, targetAccount: p.targetAccount, amount: amount.toFixed(2), status: 'RESERVED', createdAt: new Date() });
    await this.emit('account.funds.reserved', event.correlationId, { transactionId: p.transactionId, sourceAccount: p.sourceAccount, targetAccount: p.targetAccount, amount });
  }

  private async complete(event: BankEvent<any>) {
    const tx = event.payload.transactionId;
    const r = await this.reservations.findOneBy({ transactionId: tx });
    if (!r || r.status === 'COMPLETED') return;
    const s = await this.accounts.findOneByOrFail({ accountId: r.sourceAccount });
    const t = await this.accounts.findOneByOrFail({ accountId: r.targetAccount });
    const amount = Number(r.amount);
    s.balance = (Number(s.balance) - amount).toFixed(2); s.reservedBalance = Math.max(0, Number(s.reservedBalance) - amount).toFixed(2); s.lastActivityAt = new Date();
    t.balance = (Number(t.balance) + amount).toFixed(2); t.lastActivityAt = new Date();
    r.status = 'COMPLETED';
    await this.accounts.save([s,t]); await this.reservations.save(r);
    await this.emit('account.transfer.completed', event.correlationId, { transactionId: tx, sourceAccount: s.accountId, targetAccount: t.accountId, amount });
  }

  private async release(event: BankEvent<any>) {
    const tx = event.payload.transactionId;
    const r = await this.reservations.findOneBy({ transactionId: tx });
    if (!r || r.status === 'RELEASED') return;
    const s = await this.accounts.findOneByOrFail({ accountId: r.sourceAccount });
    const amount = Number(r.amount);
    s.reservedBalance = Math.max(0, Number(s.reservedBalance) - amount).toFixed(2); s.lastActivityAt = new Date(); r.status = 'RELEASED';
    await this.accounts.save(s); await this.reservations.save(r);
    await this.emit('account.funds.released', event.correlationId, { transactionId: tx, amount, reason: 'SAGA_COMPENSATION' });
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
  private toDto(a: AccountEntity) { return { accountId:a.accountId, customerId:a.customerId, type:a.type, balance:Number(a.balance), reservedBalance:Number(a.reservedBalance), availableBalance:Number(a.balance)-Number(a.reservedBalance), status:a.status, lastActivityAt:a.lastActivityAt }; }
}
