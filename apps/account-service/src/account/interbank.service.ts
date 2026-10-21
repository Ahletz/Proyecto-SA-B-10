import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AccountEntity } from './account.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { InterbankOperationEntity } from './interbank-operation.entity';
import { RabbitService } from './rabbit.service';
import { BankEvent } from '../common/bank-event';
import { recordDuplicateEvent, timed, Outcome } from '../common/telemetry';
import { checkIncomingDeposit, checkOutgoing, fromExternalAccount, RejectReason } from './interbank.rules';

type Step = 'done' | 'rejected' | 'skipped';
export type CancelResult = { result: 'CANCELLED' | 'ALREADY_ACCEPTED' | 'ALREADY_REJECTED'; reasonCode?: string | null };

const lockWrite = { mode: 'pessimistic_write' } as const;
const classify = (r: Step): Outcome => (r === 'rejected' ? 'business_rejection' : 'success');

// Lado Account del depósito interbancario. Eventos que consume:
//   interbank.transfer.requested   (Transaction)  -> reservar fondos (somos emisor)
//   interbank.transfer.accepted    (Payment)      -> confirmar el débito
//   interbank.transfer.rejected / .reversed (Payment) -> liberar la reserva
//   interbank.deposit.requested    (Payment)      -> acreditar (somos receptor)
//   interbank.reversal.requested   (Payment)      -> debitar un depósito acreditado (reverso)
@Injectable()
export class InterbankService {
  private readonly logger = new Logger(InterbankService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(InterbankOperationEntity) private readonly ops: Repository<InterbankOperationEntity>,
    @InjectRepository(ProcessedEventEntity) private readonly processed: Repository<ProcessedEventEntity>,
    private readonly rabbit: RabbitService,
  ) {}

  async handle(event: BankEvent<any>) {
    if (await this.processed.existsBy({ eventId: event.eventId })) {
      recordDuplicateEvent(event.eventType);
      return;
    }
    switch (event.eventType) {
      case 'interbank.transfer.requested':
        await timed('account.interbank.reserve', () => this.reserve(event), classify);
        break;
      case 'interbank.transfer.accepted':
        await timed('account.interbank.debit', () => this.debit(event), classify);
        break;
      case 'interbank.transfer.rejected':
      case 'interbank.transfer.reversed':
        await timed('account.interbank.release', () => this.release(event), classify);
        break;
      case 'interbank.deposit.requested':
        await timed('account.interbank.credit', () => this.credit(event), classify);
        break;
      case 'interbank.reversal.requested':
        await timed('account.interbank.reversal', () => this.reverse(event), classify);
        break;
      default:
        this.logger.warn({ message: 'Evento interbancario desconocido', event: 'interbank.unknown_event', eventType: event.eventType });
    }
    await this.processed.save({ eventId: event.eventId, eventType: event.eventType, correlationId: event.correlationId, processedAt: new Date() });
  }

  // ---------------------------------------------------------------- emisor
  private async reserve(event: BankEvent<any>): Promise<Step> {
    const p = event.payload;
    const id: string = p.interbankTransferId ?? p.transactionId;
    const amount = Number(p.amount);
    const base = { transactionId: p.transactionId, interbankTransferId: id };

    const outcome = await this.dataSource.transaction(async (m) => {
      const ops = m.getRepository(InterbankOperationEntity);
      const existing = await ops.findOne({ where: { interbankTransferId: id }, lock: lockWrite });
      if (existing) return { kind: 'existing' as const, op: existing };

      const source = await m.getRepository(AccountEntity).findOne({ where: { accountId: p.sourceAccount }, lock: lockWrite });
      const reason = checkOutgoing({ amount, currency: p.currency, source });
      const now = new Date();
      if (reason || !source) {
        await ops.insert({
          interbankTransferId: id, direction: 'OUT', accountId: p.sourceAccount ?? null, partnerBankCode: p.destinationBankCode ?? null,
          amount: (Number.isFinite(amount) ? amount : 0).toFixed(2), feeAmount: '0.00', status: 'REJECTED', reasonCode: reason, transactionId: p.transactionId ?? null,
          reversalId: null, createdAt: now, updatedAt: now,
        });
        return { kind: 'rejected' as const, reason: reason ?? 'ACCOUNT_NOT_FOUND_OR_INACTIVE' };
      }
      const fee = Number(source.feeAmount ?? 0);
      source.reservedBalance = (Number(source.reservedBalance) + amount + fee).toFixed(2);
      source.lastActivityAt = now;
      await m.getRepository(AccountEntity).save(source);
      await ops.insert({
        interbankTransferId: id, direction: 'OUT', accountId: source.accountId, partnerBankCode: p.destinationBankCode ?? null,
        amount: amount.toFixed(2), feeAmount: fee.toFixed(2), status: 'RESERVED', reasonCode: null, transactionId: p.transactionId ?? null,
        reversalId: null, createdAt: now, updatedAt: now,
      });
      return { kind: 'reserved' as const, fee };
    });

    if (outcome.kind === 'existing') {
      // Reentrega del mismo evento: se repite la respuesta que corresponde, sin volver a reservar.
      if (outcome.op.status === 'RESERVED') {
        await this.emitReserved(event.correlationId, p, id, amount, Number(outcome.op.feeAmount));
      } else if (outcome.op.status === 'REJECTED') {
        await this.emit('account.interbank.funds.rejected', event.correlationId, { ...base, reason: outcome.op.reasonCode });
      }
      return 'skipped';
    }
    if (outcome.kind === 'rejected') {
      await this.emit('account.interbank.funds.rejected', event.correlationId, { ...base, reason: outcome.reason });
      return 'rejected';
    }
    await this.emitReserved(event.correlationId, p, id, amount, outcome.fee);
    return 'done';
  }

  private emitReserved(correlationId: string, p: any, id: string, amount: number, fee: number) {
    return this.emit('account.interbank.funds.reserved', correlationId, {
      transactionId: p.transactionId, interbankTransferId: id, sourceAccount: p.sourceAccount,
      destinationBankCode: p.destinationBankCode, destinationAccount: p.destinationAccount,
      amount, fee, currency: 'GTQ', description: p.description ?? null,
    });
  }

  private async debit(event: BankEvent<any>): Promise<Step> {
    const id: string = event.payload.interbankTransferId ?? event.payload.transactionId;
    const result = await this.dataSource.transaction(async (m) => {
      const op = await m.getRepository(InterbankOperationEntity).findOne({ where: { interbankTransferId: id, direction: 'OUT' }, lock: lockWrite });
      if (!op || op.status === 'DEBITED') return { step: 'skipped' as const, op };
      if (op.status !== 'RESERVED') return { step: 'skipped' as const, op, conflict: true };
      const account = await m.getRepository(AccountEntity).findOneByOrFail({ accountId: op.accountId! });
      const total = Number(op.amount) + Number(op.feeAmount);
      account.balance = (Number(account.balance) - total).toFixed(2);
      account.reservedBalance = Math.max(0, Number(account.reservedBalance) - total).toFixed(2);
      account.lastActivityAt = new Date();
      await m.getRepository(AccountEntity).save(account);
      op.status = 'DEBITED';
      op.updatedAt = new Date();
      await m.getRepository(InterbankOperationEntity).save(op);
      return { step: 'done' as const, op };
    });
    if (result.step === 'skipped') {
      // Aceptada por el banco pareja cuando ya habíamos liberado la reserva: lo resuelve el reverso (Payment).
      if ((result as any).conflict) this.logger.error({ message: 'Transferencia aceptada pero la reserva ya no está activa', event: 'interbank.debit_conflict', interbankTransferId: id, status: result.op?.status });
      return 'skipped';
    }
    await this.emit('account.interbank.transfer.completed', event.correlationId, {
      transactionId: result.op.transactionId, interbankTransferId: id, sourceAccount: result.op.accountId, amount: Number(result.op.amount), fee: Number(result.op.feeAmount),
    });
    return 'done';
  }

  private async release(event: BankEvent<any>): Promise<Step> {
    const id: string = event.payload.interbankTransferId ?? event.payload.transactionId;
    const result = await this.dataSource.transaction(async (m) => {
      const op = await m.getRepository(InterbankOperationEntity).findOne({ where: { interbankTransferId: id, direction: 'OUT' }, lock: lockWrite });
      if (!op || op.status !== 'RESERVED') return { step: 'skipped' as const, op };
      const account = await m.getRepository(AccountEntity).findOneByOrFail({ accountId: op.accountId! });
      const total = Number(op.amount) + Number(op.feeAmount);
      account.reservedBalance = Math.max(0, Number(account.reservedBalance) - total).toFixed(2);
      account.lastActivityAt = new Date();
      await m.getRepository(AccountEntity).save(account);
      op.status = 'RELEASED';
      op.reasonCode = event.payload.reasonCode ?? null;
      op.updatedAt = new Date();
      await m.getRepository(InterbankOperationEntity).save(op);
      return { step: 'done' as const, op };
    });
    if (result.step === 'skipped') return 'skipped';
    await this.emit('account.interbank.funds.released', event.correlationId, {
      transactionId: result.op.transactionId, interbankTransferId: id, amount: Number(result.op.amount), fee: Number(result.op.feeAmount),
      reason: event.eventType === 'interbank.transfer.reversed' ? 'TIMEOUT_REVERSED' : 'REJECTED_BY_PARTNER',
    });
    return 'done';
  }

  // -------------------------------------------------------------- receptor
  private async credit(event: BankEvent<any>): Promise<Step> {
    const p = event.payload;
    const id: string = p.interbankTransferId;
    const decision = await this.dataSource.transaction(async (m) => {
      const ops = m.getRepository(InterbankOperationEntity);
      const existing = await ops.findOne({ where: { interbankTransferId: id }, lock: lockWrite });
      if (existing) return { op: existing, fresh: false };

      const accountId = fromExternalAccount(p.destinationAccount);
      const account = accountId ? await m.getRepository(AccountEntity).findOne({ where: { accountId }, lock: lockWrite }) : null;
      const amount = Number(p.amount);
      const now = new Date();
      const reason = checkIncomingDeposit({ now, expiresAt: new Date(p.expiresAt), amount, currency: p.currency, account });
      const op = ops.create({
        interbankTransferId: id, direction: 'IN', accountId: account?.accountId ?? accountId, partnerBankCode: p.originBankCode ?? null,
        amount: (Number.isFinite(amount) ? amount : 0).toFixed(2), feeAmount: '0.00', status: reason ? 'REJECTED' : 'CREDITED',
        reasonCode: reason, transactionId: null, reversalId: null, createdAt: now, updatedAt: now,
      });
      await ops.insert(op);
      if (!reason && account) {
        account.balance = (Number(account.balance) + amount).toFixed(2);
        account.lastActivityAt = now;
        await m.getRepository(AccountEntity).save(account);
      }
      return { op, fresh: true };
    });

    await this.emitDepositResult(event.correlationId, decision.op);
    return decision.op.status === 'CREDITED' ? 'done' : decision.fresh ? 'rejected' : 'skipped';
  }

  private emitDepositResult(correlationId: string, op: InterbankOperationEntity) {
    if (op.status === 'CREDITED' || op.status === 'REFUNDED') {
      return this.emit('account.interbank.deposit.credited', correlationId, { interbankTransferId: op.interbankTransferId, accountId: op.accountId, amount: Number(op.amount) });
    }
    return this.emit('account.interbank.deposit.rejected', correlationId, {
      interbankTransferId: op.interbankTransferId, reasonCode: op.reasonCode ?? 'PROCESSING_ERROR', reasonMessage: reasonMessage(op.reasonCode as RejectReason | null),
    });
  }

  // Llamado por Payment (HTTP interno) cuando el banco pareja cancela. Es LA fuente de verdad: decide dentro de una
  // transacción con bloqueo de fila, así un depósito en curso nunca se acredita después de responder CANCELLED.
  async cancelDeposit(interbankTransferId: string): Promise<CancelResult> {
    return this.dataSource.transaction(async (m) => {
      const ops = m.getRepository(InterbankOperationEntity);
      const op = await ops.findOne({ where: { interbankTransferId }, lock: lockWrite });
      if (!op) {
        const now = new Date();
        await ops.insert({
          interbankTransferId, direction: 'IN', accountId: null, partnerBankCode: null, amount: '0.00', feeAmount: '0.00',
          status: 'CANCELLED', reasonCode: 'CANCELLED', transactionId: null, reversalId: null, createdAt: now, updatedAt: now,
        });
        return { result: 'CANCELLED' as const };
      }
      if (op.status === 'CREDITED' || op.status === 'REFUNDED') return { result: 'ALREADY_ACCEPTED' as const };
      if (op.status === 'REJECTED') return { result: 'ALREADY_REJECTED' as const, reasonCode: op.reasonCode };
      return { result: 'CANCELLED' as const };
    });
  }

  // Reverso: el banco pareja pide devolver un depósito que ya acreditamos (callback tardío en su lado).
  private async reverse(event: BankEvent<any>): Promise<Step> {
    const p = event.payload;
    const outcome = await this.dataSource.transaction(async (m) => {
      const ops = m.getRepository(InterbankOperationEntity);
      const op = await ops.findOne({ where: { interbankTransferId: p.originalTransferId, direction: 'IN' }, lock: lockWrite });
      if (op && op.status === 'REFUNDED' && op.reversalId === p.reversalId) return { ok: true as const, op, again: true };
      if (!op || op.status !== 'CREDITED') return { ok: false as const, reason: 'ORIGINAL_NOT_CREDITED' };
      const account = await m.getRepository(AccountEntity).findOne({ where: { accountId: op.accountId! }, lock: lockWrite });
      const amount = Number(op.amount);
      if (!account || Number(account.balance) - Number(account.reservedBalance) < amount) return { ok: false as const, reason: 'INSUFFICIENT_FUNDS' };
      account.balance = (Number(account.balance) - amount).toFixed(2);
      account.lastActivityAt = new Date();
      await m.getRepository(AccountEntity).save(account);
      op.status = 'REFUNDED';
      op.reversalId = p.reversalId;
      op.updatedAt = new Date();
      await ops.save(op);
      return { ok: true as const, op, again: false };
    });
    if (!outcome.ok) {
      await this.emit('account.interbank.reversal.failed', event.correlationId, { reversalId: p.reversalId, originalTransferId: p.originalTransferId, reason: outcome.reason });
      return 'rejected';
    }
    await this.emit('account.interbank.reversal.debited', event.correlationId, {
      reversalId: p.reversalId, originalTransferId: p.originalTransferId, accountId: outcome.op.accountId, amount: Number(outcome.op.amount),
    });
    return outcome.again ? 'skipped' : 'done';
  }

  private async emit(type: string, correlationId: string, payload: any) {
    await this.rabbit.publish({ eventId: randomUUID(), eventType: type, version: 1, timestamp: new Date().toISOString(), correlationId, payload });
  }
}

function reasonMessage(code: RejectReason | null): string {
  switch (code) {
    case 'ACCOUNT_NOT_FOUND': return 'La cuenta destino no existe';
    case 'ACCOUNT_INACTIVE': return 'La cuenta destino está inactiva';
    case 'AMOUNT_LIMIT_EXCEEDED': return 'El monto supera el límite de Q10,000.00';
    case 'CURRENCY_NOT_SUPPORTED': return 'Solo se acepta GTQ';
    case 'EXPIRED': return 'El mensaje venció antes de procesarse';
    case 'CANCELLED': return 'La transferencia fue cancelada';
    default: return 'Error al procesar el depósito';
  }
}
