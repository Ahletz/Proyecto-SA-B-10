import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { And, In, IsNull, LessThan, LessThanOrEqual, MoreThanOrEqual, Not, Or, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ProcessedEventEntity } from '../payment/processed-event.entity';
import { RabbitService } from '../payment/rabbit.service';
import { BankEvent } from '../common/bank-event';
import { Outcome, recordDuplicateEvent, recordInterbank, recordReconciliationMismatch, timed } from '../common/telemetry';
import { InterbankTransferEntity } from './interbank-transfer.entity';
import { InterbankReversalEntity } from './interbank-reversal.entity';
import { PartnerClient } from './partner-client';
import {
  backoffMs, callbackDecision, deterministicUuid, diffReconciliation, formatAmount, hashTransfer, isBankCode, isUuid, marginExpired,
  resolveCancel, resolveQuery, TransferRequest, toExternalAccount, TTL_SECONDS, validateTransferRequest, ReconItem,
} from './interbank.rules';

export class InterbankHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) { super(message); }
}
const httpOutcome = (e: unknown): Outcome => (e instanceof InterbankHttpError && e.status < 500 ? 'business_rejection' : 'technical_error');

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const LOCK_MS = 30_000;
const DAY_MS = 86_400_000;

@Injectable()
export class InterbankService {
  private readonly logger = new Logger(InterbankService.name);

  constructor(
    @InjectRepository(InterbankTransferEntity) private readonly transfers: Repository<InterbankTransferEntity>,
    @InjectRepository(InterbankReversalEntity) private readonly reversals: Repository<InterbankReversalEntity>,
    @InjectRepository(ProcessedEventEntity) private readonly processed: Repository<ProcessedEventEntity>,
    private readonly rabbit: RabbitService,
    private readonly client: PartnerClient,
    private readonly config: ConfigService,
  ) {}

  ownBank(): string {
    const code = this.config.get<string>('INTERBANK_BANK_CODE');
    if (!isBankCode(code)) throw new InterbankHttpError(503, 'SERVICE_UNAVAILABLE', 'INTERBANK_BANK_CODE no está configurado', 30);
    return code;
  }
  private num(key: string, def: number) { return Number(this.config.get(key, String(def))); }

  // ================================================================ RECEPTOR (HTTP)
  health() { return { status: 'UP', bankCode: this.ownBank() }; }

  // POST /transfers
  receiveTransfer(caller: string | undefined, idempotencyKey: string | undefined, body: unknown) {
    return timed('interbank.receive', async () => {
      this.requireCaller(caller);
      const errors = validateTransferRequest(body);
      if (errors.length) throw new InterbankHttpError(400, 'VALIDATION_ERROR', errors.join('; '));
      const req = body as TransferRequest;
      if (idempotencyKey !== req.interbankTransferId) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key debe ser igual a interbankTransferId');
      if (req.destinationBankCode !== this.ownBank()) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'destinationBankCode no corresponde a este banco');
      if (req.originBankCode !== caller) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'originBankCode no coincide con el banco que llama');

      const hash = hashTransfer(req);
      const existing = await this.transfers.findOneBy({ id: req.interbankTransferId });
      if (existing) return this.repeated(existing, hash, caller!);

      // Un mensaje que llega vencido (reintento, DLQ…) no se procesa.
      if (Date.now() >= Date.parse(req.expiresAt)) throw new InterbankHttpError(422, 'EXPIRED', 'El mensaje ya venció (expiresAt)');

      const now = new Date();
      const row = this.transfers.create({
        id: req.interbankTransferId, direction: 'IN', partnerBankCode: req.originBankCode, originAccount: req.originAccount, destinationAccount: req.destinationAccount,
        amount: req.amount, currency: req.currency, description: req.description ?? null, messageCreatedAt: new Date(req.createdAt), expiresAt: new Date(req.expiresAt),
        state: 'PROCESSING', reasonCode: null, reasonMessage: null, requestHash: hash, transactionId: null, correlationId: randomUUID(), isRefund: false,
        sendAttempts: 0, nextAttemptAt: null, lockedUntil: null, timeoutAt: null, timeoutStep: null, stepAttempts: 0, callbackState: null, callbackAttempts: 0,
        resolvedAt: null, pendingEvent: true, createdAt: now, updatedAt: now,
      });
      try {
        await this.transfers.insert(row);
      } catch (e) {
        const again = await this.transfers.findOneBy({ id: req.interbankTransferId });
        if (again) return this.repeated(again, hash, caller!);
        throw e;
      }
      recordInterbank('receptor', 'PROCESSING');
      this.logger.log({ message: 'Depósito interbancario recibido', event: 'interbank.received', interbankTransferId: row.id, partnerBankCode: row.partnerBankCode, amount: row.amount });
      await this.flushRow(row.id);
      return { status: 202, body: { interbankTransferId: row.id, status: 'PROCESSING', receivedAt: now.toISOString() } };
    }, (r) => (r.status >= 500 ? 'technical_error' : 'success'), httpOutcome);
  }

  private repeated(row: InterbankTransferEntity, hash: string, caller: string) {
    if (row.direction !== 'IN' || row.partnerBankCode !== caller || (row.requestHash && row.requestHash !== hash)) {
      throw new InterbankHttpError(409, 'IDEMPOTENCY_CONFLICT', 'Ya existe una solicitud con ese id y contenido distinto');
    }
    return { status: 200, body: this.statusBody(row) };
  }

  private statusBody(row: InterbankTransferEntity) {
    return {
      interbankTransferId: row.id, status: row.state,
      ...(row.reasonCode && (row.state === 'REJECTED' || row.state === 'CANCELLED') ? { reasonCode: row.reasonCode } : {}),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // GET /transfers/{id}
  getTransfer(caller: string | undefined, id: string) {
    return timed('interbank.status', async () => {
      this.requireCaller(caller);
      this.requireUuid(id);
      const row = await this.transfers.findOneBy({ id });
      if (!row || row.direction !== 'IN') throw new InterbankHttpError(404, 'NOT_FOUND', 'No existe registro de esa transferencia');
      if (row.partnerBankCode !== caller) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'El banco que llama no participa en esta transferencia');
      return { status: 200, body: this.statusBody(row) };
    }, () => 'success', httpOutcome);
  }

  // POST /transfers/{id}/cancel
  cancelTransfer(caller: string | undefined, id: string, body: any) {
    return timed('interbank.cancel', async () => {
      this.requireCaller(caller);
      this.requireUuid(id);
      if (!body || body.originBankCode !== caller) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'originBankCode no coincide con el banco que llama');
      if (!['TIMEOUT', 'CLIENT_REQUEST'].includes(body.reason)) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'reason debe ser TIMEOUT o CLIENT_REQUEST');

      let row = await this.transfers.findOneBy({ id });
      if (!row) {
        // Nunca llegó: se guarda el id como cancelado para rechazar el mensaje original si aparece después.
        const now = new Date();
        const created = this.transfers.create({
          id, direction: 'IN', partnerBankCode: caller!, originAccount: null, destinationAccount: null, amount: '0.00', currency: 'GTQ', description: null,
          messageCreatedAt: null, expiresAt: null, state: 'CANCELLED', reasonCode: 'CANCELLED', reasonMessage: null, requestHash: null, transactionId: null,
          correlationId: randomUUID(), isRefund: false, sendAttempts: 0, nextAttemptAt: null, lockedUntil: null, timeoutAt: null, timeoutStep: null, stepAttempts: 0,
          callbackState: null, callbackAttempts: 0, resolvedAt: now, pendingEvent: false, createdAt: now, updatedAt: now,
        });
        try { await this.transfers.insert(created); recordInterbank('receptor', 'CANCELLED'); } catch { /* otra solicitud lo creó: se relee */ }
        row = (await this.transfers.findOneBy({ id }))!;
        this.logger.warn({ message: 'Cancelación de una transferencia no recibida', event: 'interbank.cancelled_unknown', interbankTransferId: id, partnerBankCode: caller });
      }
      if (row.direction !== 'IN' || row.partnerBankCode !== caller) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'El banco que llama no participa en esta transferencia');

      if (row.state === 'PROCESSING') {
        // Account decide con una transacción y bloqueo de fila: así un depósito en curso no se acredita después de responder CANCELLED.
        const verdict = await this.cancelAtAccount(id);
        const now = new Date();
        if (verdict.result === 'CANCELLED') {
          await this.transition(id, ['PROCESSING'], { state: 'CANCELLED', reasonCode: 'CANCELLED', resolvedAt: now });
          recordInterbank('receptor', 'CANCELLED');
        } else if (verdict.result === 'ALREADY_ACCEPTED') {
          await this.transition(id, ['PROCESSING'], { state: 'ACCEPTED', resolvedAt: now, callbackState: 'PENDING', callbackAttempts: 0, nextAttemptAt: now });
          recordInterbank('receptor', 'ACCEPTED');
        } else {
          await this.transition(id, ['PROCESSING'], { state: 'REJECTED', reasonCode: verdict.reasonCode ?? 'PROCESSING_ERROR', resolvedAt: now, callbackState: 'PENDING', callbackAttempts: 0, nextAttemptAt: now });
          recordInterbank('receptor', 'REJECTED');
        }
        row = (await this.transfers.findOneBy({ id }))!;
      }
      const result = row.state === 'ACCEPTED' ? 'ALREADY_ACCEPTED' : row.state === 'REJECTED' ? 'ALREADY_REJECTED' : 'CANCELLED';
      this.logger.log({ message: 'Cancelación atendida', event: 'interbank.cancel', interbankTransferId: id, result });
      return { status: 200, body: { interbankTransferId: id, result } };
    }, () => 'success', httpOutcome);
  }

  private async cancelAtAccount(id: string): Promise<{ result: 'CANCELLED' | 'ALREADY_ACCEPTED' | 'ALREADY_REJECTED'; reasonCode?: string | null }> {
    const base = this.config.get<string>('ACCOUNT_SERVICE_URL', 'http://account-service:3004').replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/internal/interbank/deposits/${id}/cancel`, { method: 'POST', signal: AbortSignal.timeout(this.num('INTERBANK_ACCOUNT_TIMEOUT_MS', 4000)) });
      if (res.ok) {
        const body = (await res.json()) as { result?: string; reasonCode?: string | null };
        if (body.result === 'CANCELLED' || body.result === 'ALREADY_ACCEPTED' || body.result === 'ALREADY_REJECTED') return { result: body.result, reasonCode: body.reasonCode };
      }
      this.logger.error({ message: 'Account respondió con error a la cancelación', event: 'interbank.account_cancel_failed', interbankTransferId: id, status: res.status });
    } catch (e) {
      this.logger.error({ message: 'No se pudo contactar a Account para cancelar', event: 'interbank.account_cancel_failed', interbankTransferId: id, error: String(e) });
    }
    throw new InterbankHttpError(503, 'SERVICE_UNAVAILABLE', 'No se pudo decidir la cancelación; reintente', 5);
  }

  // POST /transfers/{id}/result  (callback; nosotros somos el emisor)
  receiveResult(caller: string | undefined, id: string, body: any) {
    return timed('interbank.callback.receive', async () => {
      this.requireCaller(caller);
      this.requireUuid(id);
      const allowed = ['interbankTransferId', 'destinationBankCode', 'status', 'reasonCode', 'reasonMessage', 'processedAt'];
      if (!body || typeof body !== 'object' || Object.keys(body).some((k) => !allowed.includes(k))
        || body.interbankTransferId !== id || !isBankCode(body.destinationBankCode) || !['ACCEPTED', 'REJECTED'].includes(body.status) || typeof body.processedAt !== 'string') {
        throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'Cuerpo del callback inválido');
      }
      const status = body.status as 'ACCEPTED' | 'REJECTED';

      for (let attempt = 0; attempt < 3; attempt++) {
        const row = await this.transfers.findOneBy({ id });
        if (!row || row.direction !== 'OUT') throw new InterbankHttpError(404, 'NOT_FOUND', 'No existe registro de esa transferencia');
        if (row.partnerBankCode !== caller || body.destinationBankCode !== caller) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'El banco que llama no participa en esta transferencia');

        const decision = callbackDecision(row.state as any, status);
        if (decision === 'IGNORE') break;
        if (decision === 'CONFLICT') {
          this.logger.error({ message: 'Callback contradice el estado final de la transferencia', event: 'interbank.callback_conflict', interbankTransferId: id, ourState: row.state, callbackStatus: status });
          break;
        }
        if (decision === 'LATE_ACCEPTED') {
          this.logger.error({
            message: 'INCIDENTE: el banco pareja acreditó una transferencia cuya reserva ya liberamos; se solicita el reverso', event: 'interbank.late_accepted',
            interbankTransferId: id, ourState: row.state, partnerBankCode: row.partnerBankCode, amount: row.amount,
          });
          recordInterbank('emisor', 'late_accepted');
          await this.createReversalRequest(row);
          break;
        }
        const ok = status === 'ACCEPTED'
          ? await this.finalizeOut(id, ['PENDING', 'SENT', 'TIMEOUT'], 'ACCEPTED', {})
          : await this.finalizeOut(id, ['PENDING', 'SENT', 'TIMEOUT'], 'REJECTED', { reasonCode: body.reasonCode ?? 'PROCESSING_ERROR', reasonMessage: body.reasonMessage ?? null });
        if (ok) break;
      }
      return { status: 200, body: { interbankTransferId: id, received: true } };
    }, () => 'success', httpOutcome);
  }

  // POST /reversals  (el banco pareja nos pide devolver un depósito que acreditamos)
  requestReversal(caller: string | undefined, body: any) {
    return timed('interbank.reversal.receive', async () => {
      this.requireCaller(caller);
      const ok = body && isUuid(body.reversalId) && isUuid(body.originalTransferId) && body.originBankCode === caller && body.currency === 'GTQ'
        && typeof body.amount === 'string' && /^[0-9]{1,5}\.[0-9]{2}$/.test(body.amount);
      if (!ok) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'Cuerpo del reverso inválido');
      const existing = await this.reversals.findOneBy({ id: body.reversalId });
      if (existing) {
        if (existing.direction !== 'IN' || existing.partnerBankCode !== caller || existing.originalTransferId !== body.originalTransferId) throw new InterbankHttpError(409, 'IDEMPOTENCY_CONFLICT', 'reversalId ya usado con otro contenido');
        return { status: 202, body: this.reversalBody(existing) };
      }
      const original = await this.transfers.findOneBy({ id: body.originalTransferId });
      if (!original || original.direction !== 'IN' || original.partnerBankCode !== caller || original.state !== 'ACCEPTED') {
        throw new InterbankHttpError(404, 'NOT_FOUND', 'No hay un depósito acreditado con ese id para ese banco');
      }
      if (formatAmount(original.amount) !== body.amount) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'El monto no coincide con el depósito original');
      const now = new Date();
      const row = this.reversals.create({
        id: body.reversalId, direction: 'IN', originalTransferId: original.id, partnerBankCode: caller!, amount: original.amount, currency: 'GTQ', state: 'PROCESSING',
        refundTransferId: null, reasonMessage: null, correlationId: randomUUID(), attempts: 0, nextAttemptAt: null, lockedUntil: null, pendingEvent: true, createdAt: now, updatedAt: now,
      });
      try { await this.reversals.insert(row); } catch (e) {
        const again = await this.reversals.findOneBy({ id: body.reversalId });
        if (!again) throw e;
        return { status: 202, body: this.reversalBody(again) };
      }
      this.logger.warn({ message: 'Solicitud de reverso recibida', event: 'interbank.reversal_requested', reversalId: row.id, originalTransferId: original.id, partnerBankCode: caller });
      await this.flushReversal(row.id);
      return { status: 202, body: this.reversalBody(row) };
    }, () => 'success', httpOutcome);
  }

  // GET /reversals/{id}
  getReversal(caller: string | undefined, id: string) {
    return timed('interbank.reversal.status', async () => {
      this.requireCaller(caller);
      this.requireUuid(id);
      const row = await this.reversals.findOneBy({ id });
      if (!row || row.direction !== 'IN') throw new InterbankHttpError(404, 'NOT_FOUND', 'No existe ese reverso');
      if (row.partnerBankCode !== caller) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'El banco que llama no participa en este reverso');
      return { status: 200, body: this.reversalBody(row) };
    }, () => 'success', httpOutcome);
  }

  private reversalBody(r: InterbankReversalEntity) {
    return { reversalId: r.id, status: r.state, ...(r.refundTransferId ? { refundTransferId: r.refundTransferId } : {}), ...(r.reasonMessage ? { reasonMessage: r.reasonMessage } : {}) };
  }

  // GET /reconciliation?date=&page=&pageSize=
  reconciliation(caller: string | undefined, date: string | undefined, pageRaw?: string, pageSizeRaw?: string) {
    return timed('interbank.reconciliation', async () => {
      this.requireCaller(caller);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'date debe ser YYYY-MM-DD');
      const page = pageRaw === undefined ? 1 : Number(pageRaw);
      const pageSize = pageSizeRaw === undefined ? 100 : Number(pageSizeRaw);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'page >= 1 y 1 <= pageSize <= 500');
      const start = new Date(`${date}T00:00:00Z`);
      const [rows, total] = await this.transfers.findAndCount({
        where: { direction: 'IN', partnerBankCode: caller, requestHash: Not(IsNull()), createdAt: And(MoreThanOrEqual(start), LessThan(new Date(start.getTime() + DAY_MS))) },
        order: { createdAt: 'ASC', id: 'ASC' }, skip: (page - 1) * pageSize, take: pageSize,
      });
      return {
        status: 200,
        body: {
          date, page, pageSize, totalItems: total,
          items: rows.map((r) => ({ interbankTransferId: r.id, amount: formatAmount(r.amount), currency: r.currency, status: r.state, updatedAt: r.updatedAt.toISOString() })),
        },
      };
    }, () => 'success', httpOutcome);
  }

  private requireCaller(caller: string | undefined) {
    if (!isBankCode(caller)) throw new InterbankHttpError(401, 'UNAUTHORIZED', 'Banco que llama no identificado');
  }
  private requireUuid(id: string) {
    if (!isUuid(id)) throw new InterbankHttpError(400, 'VALIDATION_ERROR', 'El id debe ser un UUID');
  }

  // ================================================================ EVENTOS (desde Account)
  async handleEvent(e: BankEvent<any>) {
    if (await this.processed.existsBy({ eventId: e.eventId })) { recordDuplicateEvent(e.eventType); return; }
    const p = e.payload;
    switch (e.eventType) {
      case 'account.interbank.funds.reserved': await this.onFundsReserved(e); break;
      case 'account.interbank.deposit.credited': await this.onDepositResult(p.interbankTransferId, 'ACCEPTED', null, null); break;
      case 'account.interbank.deposit.rejected': await this.onDepositResult(p.interbankTransferId, 'REJECTED', p.reasonCode, p.reasonMessage); break;
      case 'account.interbank.reversal.debited': await this.onReversalDebited(e); break;
      case 'account.interbank.reversal.failed': await this.onReversalFailed(p.reversalId, p.reason); break;
      default: this.logger.warn({ message: 'Evento interbancario desconocido', event: 'interbank.unknown_event', eventType: e.eventType });
    }
    await this.processed.save({ eventId: e.eventId, eventType: e.eventType, correlationId: e.correlationId, processedAt: new Date() });
  }

  // Account reservó los fondos: se crea el depósito saliente y se envía al banco pareja.
  private async onFundsReserved(e: BankEvent<any>) {
    const p = e.payload;
    const id: string = p.interbankTransferId;
    const now = new Date(); now.setMilliseconds(0);
    const row = this.transfers.create({
      id, direction: 'OUT', partnerBankCode: p.destinationBankCode, originAccount: toExternalAccount(p.sourceAccount), destinationAccount: p.destinationAccount,
      amount: formatAmount(p.amount), currency: 'GTQ', description: p.description ?? null, messageCreatedAt: now, expiresAt: new Date(now.getTime() + TTL_SECONDS * 1000),
      state: 'PENDING', reasonCode: null, reasonMessage: null, requestHash: null, transactionId: p.transactionId ?? null, correlationId: e.correlationId, isRefund: false,
      sendAttempts: 0, nextAttemptAt: null, lockedUntil: null, timeoutAt: null, timeoutStep: null, stepAttempts: 0, callbackState: null, callbackAttempts: 0,
      resolvedAt: null, pendingEvent: false, createdAt: now, updatedAt: now,
    });
    try { await this.transfers.insert(row); recordInterbank('emisor', 'PENDING'); } catch { /* reentrega: ya existe */ }
    await this.sendNow(id).catch((err) => this.logger.warn({ message: 'Envío inmediato falló; lo reintenta el worker', event: 'interbank.send_deferred', interbankTransferId: id, error: String(err) }));
  }

  private async onDepositResult(id: string, status: 'ACCEPTED' | 'REJECTED', reasonCode: string | null, reasonMessage: string | null) {
    const row = await this.transfers.findOneBy({ id });
    if (!row || row.direction !== 'IN') { this.logger.warn({ message: 'Resultado de Account para una transferencia desconocida', event: 'interbank.unknown_result', interbankTransferId: id }); return; }
    if (row.state === 'PROCESSING') {
      const now = new Date();
      await this.transition(id, ['PROCESSING'], {
        state: status, reasonCode: status === 'REJECTED' ? reasonCode ?? 'PROCESSING_ERROR' : null, reasonMessage: status === 'REJECTED' ? reasonMessage : null,
        resolvedAt: now, callbackState: 'PENDING', callbackAttempts: 0, nextAttemptAt: now,
      });
      recordInterbank('receptor', status);
      this.logger.log({ message: 'Depósito interbancario resuelto', event: 'interbank.resolved', interbankTransferId: id, status, reasonCode });
      const fresh = await this.transfers.findOneBy({ id });
      if (fresh && await this.claim(fresh.id)) await this.deliverCallback(fresh).catch(() => undefined);
    } else if (row.state === 'CANCELLED' && status === 'ACCEPTED') {
      this.logger.error({ message: 'INCIDENTE: Account acreditó un depósito que ya estaba cancelado', event: 'interbank.credited_after_cancel', interbankTransferId: id });
    }
  }

  private async onReversalDebited(e: BankEvent<any>) {
    const p = e.payload;
    const rev = await this.reversals.findOneBy({ id: p.reversalId });
    if (!rev || rev.direction !== 'IN' || rev.state !== 'PROCESSING') return;
    const original = await this.transfers.findOneBy({ id: rev.originalTransferId });
    if (!original) { await this.onReversalFailed(rev.id, 'ORIGINAL_NOT_FOUND'); return; }
    // La devolución es un depósito nuevo hacia el emisor, por el flujo normal (somos emisores de ese depósito).
    const refundId = deterministicUuid(`refund:${rev.id}`);
    const now = new Date(); now.setMilliseconds(0);
    const refund = this.transfers.create({
      id: refundId, direction: 'OUT', partnerBankCode: original.partnerBankCode, originAccount: original.destinationAccount, destinationAccount: original.originAccount,
      amount: original.amount, currency: 'GTQ', description: `Reverso ${rev.id}`.slice(0, 140), messageCreatedAt: now, expiresAt: new Date(now.getTime() + TTL_SECONDS * 1000),
      state: 'PENDING', reasonCode: null, reasonMessage: null, requestHash: null, transactionId: null, correlationId: e.correlationId, isRefund: true,
      sendAttempts: 0, nextAttemptAt: null, lockedUntil: null, timeoutAt: null, timeoutStep: null, stepAttempts: 0, callbackState: null, callbackAttempts: 0,
      resolvedAt: null, pendingEvent: false, createdAt: now, updatedAt: now,
    });
    try { await this.transfers.insert(refund); } catch { /* reentrega */ }
    await this.reversals.update({ id: rev.id }, { state: 'COMPLETED', refundTransferId: refundId, updatedAt: new Date(), pendingEvent: false });
    this.logger.warn({ message: 'Reverso ejecutado; se envía la devolución al banco pareja', event: 'interbank.reversal_done', reversalId: rev.id, refundTransferId: refundId });
    await this.sendNow(refundId).catch(() => undefined);
  }

  private async onReversalFailed(reversalId: string, reason: string) {
    await this.reversals.update({ id: reversalId, state: 'PROCESSING' }, { state: 'FAILED', reasonMessage: String(reason ?? 'ERROR').slice(0, 200), updatedAt: new Date() });
    this.logger.error({ message: 'No se pudo ejecutar el reverso solicitado', event: 'interbank.reversal_failed', reversalId, reason });
  }

  // ================================================================ EMISOR: envío
  async sendNow(id: string) {
    const row = await this.transfers.findOneBy({ id });
    if (!row || row.direction !== 'OUT' || row.state !== 'PENDING') return;
    await timed('interbank.send', async () => {
      const body: Record<string, unknown> = {
        interbankTransferId: row.id, originBankCode: this.ownBank(), destinationBankCode: row.partnerBankCode, originAccount: row.originAccount, destinationAccount: row.destinationAccount,
        amount: formatAmount(row.amount), currency: 'GTQ', createdAt: iso(row.messageCreatedAt!), expiresAt: iso(row.expiresAt!),
      };
      if (row.description) body.description = row.description;
      const res = await this.client.request(row.partnerBankCode, 'POST', '/transfers', { body, idempotencyKey: row.id });
      return this.afterSend(row, res);
    }, (r) => (r === 'sent' ? 'success' : r === 'rejected' ? 'business_rejection' : 'technical_error'));
  }

  private async afterSend(row: InterbankTransferEntity, res: { status: number; body: any; networkError?: string }): Promise<'sent' | 'retry' | 'rejected'> {
    const now = new Date();
    if (res.networkError === 'PARTNER_NOT_CONFIGURED') {
      await this.finalizeOut(row.id, ['PENDING'], 'REJECTED', { reasonCode: 'PROCESSING_ERROR', reasonMessage: 'Banco destino no configurado' });
      return 'rejected';
    }
    if (res.networkError || res.status >= 500 || res.status === 429 || res.status === 0) {
      await this.transfers.update({ id: row.id }, { sendAttempts: row.sendAttempts + 1, nextAttemptAt: new Date(now.getTime() + backoffMs(row.sendAttempts, 2000, 60_000)), lockedUntil: null, updatedAt: now });
      this.logger.warn({ message: 'Envío al banco pareja falló; se reintenta', event: 'interbank.send_failed', interbankTransferId: row.id, status: res.status, error: res.networkError, attempt: row.sendAttempts + 1 });
      return 'retry';
    }
    if (res.status === 202 || res.status === 409) {
      if (res.status === 409) this.logger.error({ message: 'El banco pareja ya tenía ese id con otro contenido', event: 'interbank.send_conflict', interbankTransferId: row.id });
      await this.transition(row.id, ['PENDING'], { state: 'SENT', sendAttempts: row.sendAttempts + 1, pendingEvent: !row.isRefund });
      recordInterbank('emisor', 'SENT');
      await this.flushRow(row.id);
      return 'sent';
    }
    if (res.status === 200) { // repetición: el receptor ya conocía el id; se actúa según su estado
      const st: string | undefined = res.body?.status;
      if (st === 'ACCEPTED') await this.finalizeOut(row.id, ['PENDING', 'SENT'], 'ACCEPTED', {});
      else if (st === 'REJECTED' || st === 'CANCELLED') await this.finalizeOut(row.id, ['PENDING', 'SENT'], 'REJECTED', { reasonCode: res.body?.reasonCode ?? 'PROCESSING_ERROR' });
      else { await this.transition(row.id, ['PENDING'], { state: 'SENT', sendAttempts: row.sendAttempts + 1, pendingEvent: !row.isRefund }); await this.flushRow(row.id); }
      return 'sent';
    }
    // 400/401/403/404/422: el banco pareja no lo va a procesar. 422 = ya venció.
    await this.finalizeOut(row.id, ['PENDING'], 'REJECTED', {
      reasonCode: res.status === 422 ? 'EXPIRED' : 'PROCESSING_ERROR', reasonMessage: `Rechazado por el banco pareja (HTTP ${res.status})`,
    });
    this.logger.error({ message: 'El banco pareja rechazó el envío', event: 'interbank.send_rejected', interbankTransferId: row.id, status: res.status, code: res.body?.code });
    return 'rejected';
  }

  // Cambia el estado de una transferencia saliente a un estado final, libera el bloqueo y deja el evento pendiente (outbox).
  private async finalizeOut(id: string, from: string[], next: 'ACCEPTED' | 'REJECTED' | 'REVERSED', patch: Partial<InterbankTransferEntity>): Promise<boolean> {
    const current = await this.transfers.findOneBy({ id });
    if (!current) return false;
    const ok = await this.transition(id, from, { ...patch, state: next, resolvedAt: new Date(), timeoutStep: null, pendingEvent: !current.isRefund });
    if (!ok) return false;
    recordInterbank('emisor', next);
    this.logger.log({ message: 'Transferencia saliente resuelta', event: 'interbank.out_resolved', interbankTransferId: id, state: next, reasonCode: patch.reasonCode ?? null, isRefund: current.isRefund });
    if (current.isRefund && next !== 'ACCEPTED') {
      this.logger.error({ message: 'INCIDENTE: la devolución de un reverso no fue aceptada; requiere acción manual', event: 'interbank.refund_failed', interbankTransferId: id, state: next });
    }
    await this.flushRow(id);
    return true;
  }

  // ================================================================ EMISOR: protocolo de timeout
  private async expireOutbound(now: Date) {
    const rows = await this.transfers.find({ where: { direction: 'OUT', state: In(['PENDING', 'SENT']), expiresAt: LessThan(now) }, take: 50 });
    for (const row of rows) {
      const ok = await this.transition(row.id, ['PENDING', 'SENT'], { state: 'TIMEOUT', timeoutAt: now, timeoutStep: 'QUERY', stepAttempts: 0, nextAttemptAt: now, pendingEvent: !row.isRefund });
      if (!ok) continue;
      recordInterbank('emisor', 'TIMEOUT');
      this.logger.warn({ message: 'Transferencia en TIMEOUT: la reserva sigue retenida; se consulta al banco pareja', event: 'interbank.timeout', interbankTransferId: row.id, partnerBankCode: row.partnerBankCode });
      await this.flushRow(row.id);
    }
  }

  private async processTimeouts(now: Date) {
    const rows = await this.transfers.find({ where: { direction: 'OUT', state: 'TIMEOUT', lockedUntil: Or(IsNull(), LessThanOrEqual(now)) }, take: 100 });
    const margin = this.num('INTERBANK_TIMEOUT_MARGIN_SECONDS', 300);
    // Toca reintentar, o ya venció el margen de expiresAt + 300 s (entonces se libera sin esperar al siguiente reintento).
    const due = rows.filter((r) => !r.nextAttemptAt || r.nextAttemptAt.getTime() <= now.getTime() || marginExpired(r.expiresAt!, now, margin));
    for (const row of due) if (await this.claim(row.id)) await this.resolveTimeout(row, now);
  }

  async resolveTimeout(row: InterbankTransferEntity, now: Date) {
    // Receptor mudo: solo se libera después de expiresAt + 300 s, y con alerta.
    if (marginExpired(row.expiresAt!, now, this.num('INTERBANK_TIMEOUT_MARGIN_SECONDS', 300))) {
      recordInterbank('emisor', 'partner_unreachable');
      this.logger.error({
        message: 'ALERTA: el banco pareja no responde; se libera la reserva tras expiresAt + 300 s', event: 'interbank.partner_unreachable',
        interbankTransferId: row.id, partnerBankCode: row.partnerBankCode, expiresAt: row.expiresAt!.toISOString(),
      });
      await this.finalizeOut(row.id, ['TIMEOUT'], 'REVERSED', { reasonCode: 'TIMEOUT_NO_RESPONSE', reasonMessage: 'El banco pareja no respondió a la consulta ni a la cancelación' });
      return;
    }
    const cancelling = row.timeoutStep === 'CANCEL';
    const resolution = await timed(cancelling ? 'interbank.timeout.cancel' : 'interbank.timeout.query', async () => {
      if (cancelling) {
        return resolveCancel(await this.client.request(row.partnerBankCode, 'POST', `/transfers/${row.id}/cancel`, { body: { originBankCode: this.ownBank(), reason: 'TIMEOUT' } }));
      }
      return resolveQuery(await this.client.request(row.partnerBankCode, 'GET', `/transfers/${row.id}`));
    }, (r) => (r.kind === 'RETRY' ? 'technical_error' : 'success'));

    switch (resolution.kind) {
      case 'ACCEPT': await this.finalizeOut(row.id, ['TIMEOUT'], 'ACCEPTED', {}); break;
      case 'RELEASE': await this.finalizeOut(row.id, ['TIMEOUT'], 'REVERSED', { reasonCode: 'TIMEOUT', reasonMessage: 'El banco pareja confirmó que no acreditó el depósito' }); break;
      case 'CANCEL':
        await this.transfers.update({ id: row.id }, { timeoutStep: 'CANCEL', stepAttempts: 0, nextAttemptAt: now, lockedUntil: null, updatedAt: now });
        break;
      case 'RETRY': {
        const attempts = row.stepAttempts + 1;
        if (!cancelling && attempts >= this.num('INTERBANK_QUERY_ATTEMPTS', 3)) {
          await this.transfers.update({ id: row.id }, { timeoutStep: 'CANCEL', stepAttempts: 0, nextAttemptAt: now, lockedUntil: null, updatedAt: now });
        } else {
          await this.transfers.update({ id: row.id }, { stepAttempts: attempts, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts - 1, 2000, 30_000)), lockedUntil: null, updatedAt: now });
        }
        this.logger.warn({ message: 'El banco pareja no respondió; se reintenta el protocolo de timeout', event: 'interbank.timeout_retry', interbankTransferId: row.id, step: row.timeoutStep, attempt: attempts });
      }
    }
  }

  // ================================================================ RECEPTOR: callback hacia el emisor
  private async deliverCallbacks(now: Date) {
    const rows = await this.transfers.find({
      where: { direction: 'IN', state: In(['ACCEPTED', 'REJECTED']), callbackState: 'PENDING', nextAttemptAt: Or(IsNull(), LessThanOrEqual(now)), lockedUntil: Or(IsNull(), LessThanOrEqual(now)) }, take: 20,
    });
    for (const row of rows) if (await this.claim(row.id)) await this.deliverCallback(row, now);
  }

  async deliverCallback(row: InterbankTransferEntity, now = new Date()) {
    const body: Record<string, unknown> = {
      interbankTransferId: row.id, destinationBankCode: this.ownBank(), status: row.state, processedAt: iso(row.resolvedAt ?? now),
    };
    if (row.state === 'REJECTED') { body.reasonCode = row.reasonCode ?? 'PROCESSING_ERROR'; if (row.reasonMessage) body.reasonMessage = row.reasonMessage; }
    const res = await timed('interbank.callback.send', () => this.client.request(row.partnerBankCode, 'POST', `/transfers/${row.id}/result`, { body }), (r) => (r.status === 200 ? 'success' : 'technical_error'));
    if (res.status === 200) {
      await this.transfers.update({ id: row.id }, { callbackState: 'DELIVERED', lockedUntil: null, updatedAt: now });
      this.logger.log({ message: 'Callback entregado al banco emisor', event: 'interbank.callback_delivered', interbankTransferId: row.id, attempts: row.callbackAttempts + 1 });
      return;
    }
    const attempts = row.callbackAttempts + 1;
    if (now.getTime() - (row.resolvedAt ?? row.createdAt).getTime() > DAY_MS) {
      await this.transfers.update({ id: row.id }, { callbackState: 'FAILED', callbackAttempts: attempts, lockedUntil: null, updatedAt: now });
      recordInterbank('receptor', 'callback_failed');
      this.logger.error({ message: 'ALERTA: no se pudo entregar el callback en 24 horas', event: 'interbank.callback_failed', interbankTransferId: row.id });
      return;
    }
    await this.transfers.update({ id: row.id }, { callbackAttempts: attempts, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts - 1)), lockedUntil: null, updatedAt: now });
    this.logger.warn({ message: 'Callback no entregado; se reintenta', event: 'interbank.callback_retry', interbankTransferId: row.id, status: res.status, error: res.networkError, attempt: attempts });
  }

  // ================================================================ REVERSOS salientes
  private async createReversalRequest(row: InterbankTransferEntity) {
    const now = new Date();
    const rev = this.reversals.create({
      id: deterministicUuid(`reversal-out:${row.id}`), direction: 'OUT', originalTransferId: row.id, partnerBankCode: row.partnerBankCode, amount: row.amount, currency: 'GTQ',
      state: 'PENDING', refundTransferId: null, reasonMessage: null, correlationId: row.correlationId, attempts: 0, nextAttemptAt: now, lockedUntil: null, pendingEvent: false, createdAt: now, updatedAt: now,
    });
    try { await this.reversals.insert(rev); } catch { /* ya solicitado */ }
  }

  private async processReversals(now: Date) {
    const rows = await this.reversals.find({
      where: { direction: 'OUT', state: In(['PENDING', 'REQUESTED']), nextAttemptAt: Or(IsNull(), LessThanOrEqual(now)), lockedUntil: Or(IsNull(), LessThanOrEqual(now)) }, take: 20,
    });
    for (const rev of rows) {
      const claimed = await this.reversals.update({ id: rev.id, lockedUntil: Or(IsNull(), LessThanOrEqual(now)) }, { lockedUntil: new Date(now.getTime() + LOCK_MS) });
      if (claimed.affected !== 1) continue;
      const giveUp = now.getTime() - rev.createdAt.getTime() > DAY_MS;
      const fail = (msg: string) => this.reversals.update({ id: rev.id }, { state: 'FAILED', reasonMessage: msg.slice(0, 200), lockedUntil: null, updatedAt: now });
      if (rev.state === 'PENDING') {
        const res = await this.client.request(rev.partnerBankCode, 'POST', '/reversals', {
          body: { reversalId: rev.id, originalTransferId: rev.originalTransferId, originBankCode: this.ownBank(), amount: formatAmount(rev.amount), currency: 'GTQ' },
        });
        if (res.status === 202 || res.status === 200) await this.reversals.update({ id: rev.id }, { state: 'REQUESTED', nextAttemptAt: new Date(now.getTime() + 10_000), lockedUntil: null, updatedAt: now });
        else if (res.status >= 400 && res.status < 500 && res.status !== 429) { await fail(`El banco pareja rechazó el reverso (HTTP ${res.status})`); this.logger.error({ message: 'ALERTA: reverso rechazado por el banco pareja', event: 'interbank.reversal_rejected', reversalId: rev.id, status: res.status }); }
        else if (giveUp) await fail('Sin respuesta del banco pareja en 24 horas');
        else await this.reversals.update({ id: rev.id }, { attempts: rev.attempts + 1, nextAttemptAt: new Date(now.getTime() + backoffMs(rev.attempts, 2000, 5 * 60_000)), lockedUntil: null, updatedAt: now });
      } else {
        const res = await this.client.request(rev.partnerBankCode, 'GET', `/reversals/${rev.id}`);
        const st: string | undefined = res.body?.status;
        if (res.status === 200 && st === 'COMPLETED') {
          await this.reversals.update({ id: rev.id }, { state: 'COMPLETED', refundTransferId: res.body?.refundTransferId ?? null, lockedUntil: null, updatedAt: now });
          this.logger.warn({ message: 'Reverso completado por el banco pareja', event: 'interbank.reversal_completed', reversalId: rev.id, refundTransferId: res.body?.refundTransferId });
        } else if (res.status === 200 && st === 'FAILED') {
          await fail(res.body?.reasonMessage ?? 'El banco pareja no pudo ejecutar el reverso');
          this.logger.error({ message: 'ALERTA: el banco pareja no pudo ejecutar el reverso', event: 'interbank.reversal_failed', reversalId: rev.id });
        } else if (giveUp) await fail('El reverso no se completó en 24 horas');
        else await this.reversals.update({ id: rev.id }, { attempts: rev.attempts + 1, nextAttemptAt: new Date(now.getTime() + 10_000), lockedUntil: null, updatedAt: now });
      }
    }
  }

  // ================================================================ CONCILIACIÓN diaria (emisor)
  async reconcile(date: string) {
    const start = new Date(`${date}T00:00:00Z`);
    const where = And(MoreThanOrEqual(start), LessThan(new Date(start.getTime() + DAY_MS)));
    const results: { partner: string; ours: number; theirs: number; issues: ReturnType<typeof diffReconciliation> | 'UNREACHABLE' }[] = [];
    for (const partner of this.client.partnerCodes()) {
      const ours: ReconItem[] = (await this.transfers.find({ where: { direction: 'OUT', partnerBankCode: partner, createdAt: where } })).map((r) => ({ id: r.id, amount: formatAmount(r.amount), status: r.state }));
      const theirs: ReconItem[] = [];
      let page = 1; let total = Infinity; let failed = false;
      while (theirs.length < total) {
        const res = await this.client.request(partner, 'GET', `/reconciliation?date=${date}&page=${page}&pageSize=500`);
        if (res.status !== 200 || !res.body) { failed = true; break; }
        total = res.body.totalItems ?? 0;
        for (const it of res.body.items ?? []) theirs.push({ id: it.interbankTransferId, amount: it.amount, status: it.status });
        if (!(res.body.items ?? []).length) break;
        page++;
      }
      if (failed) {
        this.logger.warn({ message: 'No se pudo obtener la conciliación del banco pareja', event: 'interbank.reconciliation_unavailable', partnerBankCode: partner, date });
        results.push({ partner, ours: ours.length, theirs: theirs.length, issues: 'UNREACHABLE' });
        continue;
      }
      const issues = diffReconciliation(ours, theirs);
      for (const issue of issues) this.logger.error({ message: 'Diferencia en la conciliación con el banco pareja', event: 'interbank.reconciliation_mismatch', partnerBankCode: partner, date, ...issue });
      if (issues.length) recordReconciliationMismatch(issues.length);
      this.logger.log({ message: 'Conciliación diaria terminada', event: 'interbank.reconciled', partnerBankCode: partner, date, ours: ours.length, theirs: theirs.length, mismatches: issues.length });
      results.push({ partner, ours: ours.length, theirs: theirs.length, issues });
    }
    return results;
  }

  // ================================================================ WORKER
  async tick(now = new Date()) {
    // Sin INTERBANK_BANK_CODE el módulo interbancario está desactivado (despliegues anteriores a configurarlo).
    if (!isBankCode(this.config.get<string>('INTERBANK_BANK_CODE'))) return;
    const steps: [string, () => Promise<unknown>][] = [
      ['publicar eventos', () => this.flushPending()],
      ['enviar pendientes', () => this.sendPending(now)],
      ['vencer transferencias', () => this.expireOutbound(now)],
      ['protocolo de timeout', () => this.processTimeouts(now)],
      ['entregar callbacks', () => this.deliverCallbacks(now)],
      ['reversos', () => this.processReversals(now)],
    ];
    for (const [name, fn] of steps) {
      try { await fn(); } catch (e) { this.logger.error({ message: `Falló el paso "${name}" del worker interbancario`, event: 'interbank.worker_error', step: name, error: String(e) }); }
    }
  }

  private async sendPending(now: Date) {
    const rows = await this.transfers.find({
      where: { direction: 'OUT', state: 'PENDING', nextAttemptAt: Or(IsNull(), LessThanOrEqual(now)), lockedUntil: Or(IsNull(), LessThanOrEqual(now)) }, take: 20,
    });
    for (const row of rows) if (await this.claim(row.id)) await this.sendNow(row.id);
  }

  // Outbox: publica los eventos que quedaron pendientes (por ejemplo, si RabbitMQ estaba caído al cambiar de estado).
  async flushPending() {
    const rows = await this.transfers.find({ where: { pendingEvent: true }, take: 50 });
    for (const r of rows) await this.flushRow(r.id);
    const revs = await this.reversals.find({ where: { pendingEvent: true }, take: 20 });
    for (const r of revs) await this.flushReversal(r.id);
  }

  private eventFor(row: InterbankTransferEntity): { type: string; payload: any } | null {
    if (row.direction === 'IN') {
      if (row.state !== 'PROCESSING') return null;
      return {
        type: 'interbank.deposit.requested',
        payload: { interbankTransferId: row.id, originBankCode: row.partnerBankCode, originAccount: row.originAccount, destinationAccount: row.destinationAccount, amount: formatAmount(row.amount), currency: row.currency, expiresAt: row.expiresAt?.toISOString() },
      };
    }
    if (row.isRefund) return null;
    const type = ({ SENT: 'interbank.transfer.sent', TIMEOUT: 'interbank.transfer.timeout', ACCEPTED: 'interbank.transfer.accepted', REJECTED: 'interbank.transfer.rejected', REVERSED: 'interbank.transfer.reversed' } as Record<string, string>)[row.state];
    if (!type) return null;
    return {
      type,
      payload: {
        transactionId: row.transactionId, interbankTransferId: row.id, partnerBankCode: row.partnerBankCode, amount: Number(row.amount), state: row.state,
        reasonCode: row.reasonCode, reasonMessage: row.reasonMessage, expiresAt: row.expiresAt?.toISOString(),
      },
    };
  }

  private async flushRow(id: string): Promise<void> {
    try {
      const row = await this.transfers.findOneBy({ id });
      if (!row || !row.pendingEvent) return;
      const ev = this.eventFor(row);
      if (ev) {
        // eventId determinista (id + estado): si se publica dos veces, el consumidor lo descarta por idempotencia.
        await this.rabbit.publish({ eventId: deterministicUuid(`${row.id}:${row.state}`), eventType: ev.type, version: 1, timestamp: new Date().toISOString(), correlationId: row.correlationId, payload: ev.payload });
      }
      await this.transfers.update({ id, state: row.state }, { pendingEvent: false });
    } catch (e) {
      this.logger.warn({ message: 'No se pudo publicar el evento; lo reintenta el worker', event: 'interbank.publish_deferred', interbankTransferId: id, error: String(e) });
    }
  }

  private async flushReversal(id: string): Promise<void> {
    try {
      const rev = await this.reversals.findOneBy({ id });
      if (!rev || !rev.pendingEvent || rev.direction !== 'IN' || rev.state !== 'PROCESSING') return;
      await this.rabbit.publish({
        eventId: deterministicUuid(`reversal:${rev.id}`), eventType: 'interbank.reversal.requested', version: 1, timestamp: new Date().toISOString(),
        correlationId: rev.correlationId, payload: { reversalId: rev.id, originalTransferId: rev.originalTransferId, amount: Number(rev.amount) },
      });
      await this.reversals.update({ id }, { pendingEvent: false });
    } catch (e) {
      this.logger.warn({ message: 'No se pudo publicar el evento de reverso; lo reintenta el worker', event: 'interbank.publish_deferred', reversalId: id, error: String(e) });
    }
  }

  // ---- utilidades de persistencia ----
  // Cambio de estado condicional (optimista): solo se aplica si la fila sigue en alguno de los estados esperados.
  private async transition(id: string, from: string[], patch: Partial<InterbankTransferEntity>): Promise<boolean> {
    const r = await this.transfers.update({ id, state: In(from) }, { ...patch, updatedAt: new Date(), lockedUntil: null } as any);
    return r.affected === 1;
  }

  // Reserva la fila para este worker durante 30 s (varias réplicas no procesan lo mismo a la vez).
  private async claim(id: string): Promise<boolean> {
    const now = new Date();
    const r = await this.transfers.update({ id, lockedUntil: Or(IsNull(), LessThanOrEqual(now)) } as any, { lockedUntil: new Date(now.getTime() + LOCK_MS) });
    return r.affected === 1;
  }
}
