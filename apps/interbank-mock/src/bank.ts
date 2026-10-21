import { createHash, randomBytes, randomUUID } from 'crypto';

// Simulador del banco pareja: implementa el contrato del curso (docs/interbank/openapi.yaml) sin modificarlo,
// para desarrollar sin depender del otro grupo e inyectar fallos (rechazos, timeouts, lentitud, caída).
// El estado vive en memoria del pod: se pierde al reiniciarlo (es un mock, corre con 1 réplica).

export type Mode = 'accept' | 'reject' | 'no-callback' | 'down';
export const MODES: Mode[] = ['accept', 'reject', 'no-callback', 'down'];
export const REASON_CODES = ['ACCOUNT_NOT_FOUND', 'ACCOUNT_INACTIVE', 'AMOUNT_LIMIT_EXCEEDED', 'CURRENCY_NOT_SUPPORTED', 'EXPIRED', 'CANCELLED', 'PROCESSING_ERROR'];

export interface MockConfig {
  mode: Mode;
  latencyMs: number; // se suma a cada respuesta del contrato (banco lento)
  callbackDelayMs: number; // espera antes de enviar el callback con el resultado
  rejectReason: string;
}

export interface Settings {
  bankCode: string; // código de este banco simulado (BANK99)
  partnerBankCode: string; // nuestro banco (BANK08)
  partnerBaseUrl: string; // https://.../interbank/v1 de nuestro banco
  outboundApiKey: string; // la clave que nuestro Gateway le asignó al mock
}

export interface Reply { status: number; body: unknown; headers?: Record<string, string> }
export type Send = (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<{ status: number; body: unknown }>;
export type Log = (level: 'INFO' | 'WARN' | 'ERROR', event: string, fields: Record<string, unknown>) => void;

type InState = 'PROCESSING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
interface Incoming {
  id: string; hash: string; request: Record<string, any>; status: InState; reasonCode?: string;
  traceId: string; receivedAt: Date; updatedAt: Date; callback?: { status: number; attempts: number };
}
interface Outgoing { id: string; request: Record<string, any>; sentStatus: number; result?: unknown; createdAt: Date }
interface Reversal { reversalId: string; originalTransferId: string; status: 'PROCESSING' | 'COMPLETED' | 'FAILED'; refundTransferId?: string; reasonMessage?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANK = /^BANK[0-9]{2}$/;
const ACCOUNT = /^[A-Za-z0-9-]{1,34}$/;
const AMOUNT = /^[0-9]{1,5}\.[0-9]{2}$/;
const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;
const REQUIRED = ['interbankTransferId', 'originBankCode', 'destinationBankCode', 'originAccount', 'destinationAccount', 'amount', 'currency', 'createdAt', 'expiresAt'];
const ALLOWED = new Set([...REQUIRED, 'description']);

const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const error = (status: number, code: string, message: string, headers?: Record<string, string>): Reply => ({ status, body: { code, message, timestamp: iso(now()) }, headers });
const canonical = (o: Record<string, any>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
export const childTraceparent = (traceId: string) => `00-${traceId}-${randomBytes(8).toString('hex')}-01`;
export const newTraceparent = () => childTraceparent(randomBytes(16).toString('hex'));
const traceIdOf = (traceparent: string | undefined) => TRACEPARENT.exec(traceparent ?? '')?.[1];

export class MockBank {
  config: MockConfig;
  private readonly incoming = new Map<string, Incoming>();
  private readonly outgoing = new Map<string, Outgoing>();
  private readonly reversals = new Map<string, Reversal>();

  constructor(private readonly settings: Settings, initial: MockConfig, private readonly send: Send, private readonly log: Log,
    private readonly schedule: (fn: () => void, ms: number) => void = (fn, ms) => { setTimeout(fn, ms); }) {
    this.config = { ...initial };
  }

  setConfig(patch: Partial<MockConfig>): MockConfig | string {
    const next = { ...this.config, ...patch };
    if (!MODES.includes(next.mode)) return `mode debe ser uno de ${MODES.join(', ')}`;
    if (!REASON_CODES.includes(next.rejectReason)) return `rejectReason debe ser uno de ${REASON_CODES.join(', ')}`;
    for (const k of ['latencyMs', 'callbackDelayMs'] as const) if (!Number.isInteger(next[k]) || next[k] < 0 || next[k] > 600_000) return `${k} debe ser un entero entre 0 y 600000`;
    this.config = next;
    this.log('WARN', 'mock.config.changed', { ...next });
    return next;
  }

  /** Respuesta del contrato cuando el banco simulado está caído. */
  unavailable(): Reply | null {
    return this.config.mode === 'down' ? error(503, 'SERVICE_UNAVAILABLE', 'Banco simulado caído (modo down)', { 'Retry-After': '10' }) : null;
  }

  health(): Reply {
    return this.unavailable() ?? { status: 200, body: { status: 'UP', bankCode: this.settings.bankCode } };
  }

  // ------------------------------------------------------------- receptor (nuestro banco nos envía)
  receiveTransfer(idempotencyKey: string | undefined, traceparent: string | undefined, body: unknown): Reply {
    const traceId = traceIdOf(traceparent);
    if (!traceId) return error(400, 'VALIDATION_ERROR', 'traceparent ausente o inválido');
    const r = (body ?? {}) as Record<string, any>;
    const invalid = this.validateTransfer(r);
    if (invalid) return error(400, 'VALIDATION_ERROR', invalid);
    if (idempotencyKey !== r.interbankTransferId) return error(400, 'VALIDATION_ERROR', 'Idempotency-Key debe ser igual a interbankTransferId');

    const hash = createHash('sha256').update(canonical(r)).digest('hex');
    const existing = this.incoming.get(r.interbankTransferId);
    if (existing && !existing.hash) {
      // Se canceló antes de que llegara: se acepta el mensaje y se rechaza por callback con CANCELLED.
      Object.assign(existing, { hash, request: r, traceId });
      this.log('WARN', 'mock.transfer.arrived_cancelled', { interbankTransferId: existing.id, traceId });
      this.schedule(() => void this.deliverCallback(existing, 1), this.config.callbackDelayMs);
      return { status: 202, body: { interbankTransferId: existing.id, status: 'PROCESSING', receivedAt: iso(now()) } };
    }
    if (existing) {
      if (existing.hash !== hash) return error(409, 'IDEMPOTENCY_CONFLICT', 'Mismo interbankTransferId con contenido distinto');
      this.log('INFO', 'mock.transfer.duplicate', { interbankTransferId: existing.id, status: existing.status, traceId });
      return { status: 200, body: this.statusOf(existing) };
    }
    if (new Date(r.expiresAt).getTime() < now().getTime()) return error(422, 'EXPIRED', 'El mensaje llegó después de expiresAt');

    const t: Incoming = { id: r.interbankTransferId, hash, request: r, status: 'PROCESSING', traceId, receivedAt: now(), updatedAt: now() };
    this.incoming.set(t.id, t);
    this.log('INFO', 'mock.transfer.received', { interbankTransferId: t.id, amount: r.amount, mode: this.config.mode, traceId });
    if (this.config.mode !== 'no-callback') this.schedule(() => void this.resolve(t), this.config.callbackDelayMs);
    return { status: 202, body: { interbankTransferId: t.id, status: 'PROCESSING', receivedAt: iso(t.receivedAt) } };
  }

  getTransfer(id: string): Reply {
    const t = this.incoming.get(id);
    return t ? { status: 200, body: this.statusOf(t) } : error(404, 'NOT_FOUND', 'No existe registro de ese id en este banco');
  }

  cancelTransfer(id: string, body: unknown): Reply {
    const b = (body ?? {}) as Record<string, any>;
    if (!BANK.test(b.originBankCode ?? '') || !['TIMEOUT', 'CLIENT_REQUEST'].includes(b.reason)) return error(400, 'VALIDATION_ERROR', 'originBankCode y reason (TIMEOUT|CLIENT_REQUEST) son obligatorios');
    let t = this.incoming.get(id);
    if (!t) {
      // Nunca llegó: se guarda el id para rechazar una llegada posterior del mensaje original.
      t = { id, hash: '', request: {}, status: 'CANCELLED', reasonCode: 'CANCELLED', traceId: '', receivedAt: now(), updatedAt: now() };
      this.incoming.set(id, t);
    } else if (t.status === 'PROCESSING') {
      t.status = 'CANCELLED'; t.reasonCode = 'CANCELLED'; t.updatedAt = now();
    }
    const result = t.status === 'ACCEPTED' ? 'ALREADY_ACCEPTED' : t.status === 'REJECTED' ? 'ALREADY_REJECTED' : 'CANCELLED';
    this.log('WARN', 'mock.transfer.cancel', { interbankTransferId: id, result, reason: b.reason });
    return { status: 200, body: { interbankTransferId: id, result } };
  }

  requestReversal(body: unknown): Reply {
    const b = (body ?? {}) as Record<string, any>;
    if (!UUID.test(b.reversalId ?? '') || !UUID.test(b.originalTransferId ?? '') || !AMOUNT.test(b.amount ?? '') || b.currency !== 'GTQ') return error(400, 'VALIDATION_ERROR', 'reversalId, originalTransferId, amount y currency GTQ son obligatorios');
    const known = this.reversals.get(b.reversalId);
    if (known) return { status: 202, body: known };
    const original = this.incoming.get(b.originalTransferId);
    if (!original || !original.request.originAccount) return error(404, 'NOT_FOUND', 'No existe el depósito original');
    const rev: Reversal = { reversalId: b.reversalId, originalTransferId: original.id, status: 'PROCESSING' };
    this.reversals.set(rev.reversalId, rev);
    if (original.status !== 'ACCEPTED') {
      rev.status = 'FAILED'; rev.reasonMessage = `El depósito original está ${original.status}, no hay nada que devolver`;
    } else {
      // Devolución = depósito nuevo hacia el banco que lo pidió, por el flujo normal de POST /transfers.
      const refund = this.sendTransfer(original.request.originAccount, original.request.amount, `Reverso ${original.id}`, original.request.destinationAccount);
      void refund.then((o) => { rev.refundTransferId = o.id; rev.status = o.sentStatus === 202 || o.sentStatus === 200 ? 'COMPLETED' : 'FAILED'; });
    }
    this.log('WARN', 'mock.reversal.requested', { reversalId: rev.reversalId, originalTransferId: original.id, status: rev.status });
    return { status: 202, body: rev };
  }

  getReversal(id: string): Reply {
    const r = this.reversals.get(id);
    return r ? { status: 200, body: r } : error(404, 'NOT_FOUND', 'No existe ese reverso');
  }

  reconciliation(date: string | undefined, page = 1, pageSize = 100): Reply {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || page < 1 || pageSize < 1 || pageSize > 500) return error(400, 'VALIDATION_ERROR', 'date (YYYY-MM-DD), page >= 1 y pageSize entre 1 y 500');
    const all = [...this.incoming.values()].filter((t) => t.hash && iso(t.receivedAt).slice(0, 10) === date);
    const items = all.slice((page - 1) * pageSize, page * pageSize).map((t) => ({ interbankTransferId: t.id, amount: t.request.amount, currency: 'GTQ', status: t.status, updatedAt: iso(t.updatedAt) }));
    return { status: 200, body: { date, page, pageSize, totalItems: all.length, items } };
  }

  // ------------------------------------------------------------- emisor (el mock nos envía un depósito)
  receiveResult(id: string, body: unknown): Reply {
    const o = this.outgoing.get(id);
    if (!o) return error(404, 'NOT_FOUND', 'Este banco no envió ese depósito');
    o.result = body;
    this.log('INFO', 'mock.callback.received', { interbankTransferId: id, result: body });
    return { status: 200, body: { interbankTransferId: id, received: true } };
  }

  async sendTransfer(destinationAccount: string, amount: string, description?: string, originAccount = 'MOCK-0001'): Promise<Outgoing> {
    const created = now();
    const request = {
      interbankTransferId: randomUUID(), originBankCode: this.settings.bankCode, destinationBankCode: this.settings.partnerBankCode,
      originAccount, destinationAccount, amount, currency: 'GTQ', ...(description ? { description } : {}),
      createdAt: iso(created), expiresAt: iso(new Date(created.getTime() + 180_000)),
    };
    const traceparent = newTraceparent();
    const r = await this.call('POST', '/transfers', traceparent, request, { 'Idempotency-Key': request.interbankTransferId });
    const o: Outgoing = { id: request.interbankTransferId, request, sentStatus: r.status, createdAt: created };
    this.outgoing.set(o.id, o);
    this.log('INFO', 'mock.transfer.sent', { interbankTransferId: o.id, amount, httpStatus: r.status, traceId: traceIdOf(traceparent) });
    return o;
  }

  snapshot() {
    return {
      config: this.config,
      received: [...this.incoming.values()].map((t) => ({ ...this.statusOf(t), amount: t.request.amount, traceId: t.traceId, callback: t.callback })),
      sent: [...this.outgoing.values()],
      reversals: [...this.reversals.values()],
    };
  }

  // ------------------------------------------------------------- internos
  private validateTransfer(r: Record<string, any>): string | null {
    const missing = REQUIRED.filter((k) => r[k] === undefined);
    if (missing.length) return `Faltan campos: ${missing.join(', ')}`;
    const extra = Object.keys(r).filter((k) => !ALLOWED.has(k));
    if (extra.length) return `Campos no permitidos: ${extra.join(', ')}`;
    if (!UUID.test(r.interbankTransferId)) return 'interbankTransferId debe ser un UUID';
    if (!BANK.test(r.originBankCode) || !BANK.test(r.destinationBankCode)) return 'Códigos de banco inválidos';
    if (!ACCOUNT.test(r.originAccount) || !ACCOUNT.test(r.destinationAccount)) return 'Número de cuenta inválido';
    if (!AMOUNT.test(r.amount)) return 'amount debe tener el formato 0.00';
    if (r.description !== undefined && String(r.description).length > 140) return 'description supera 140 caracteres';
    if (Number.isNaN(Date.parse(r.createdAt)) || Number.isNaN(Date.parse(r.expiresAt))) return 'createdAt y expiresAt deben ser fechas ISO 8601';
    return null;
  }

  private statusOf(t: Incoming) {
    return { interbankTransferId: t.id, status: t.status, ...(t.reasonCode ? { reasonCode: t.reasonCode } : {}), updatedAt: iso(t.updatedAt) };
  }

  /** Decide el resultado (según el modo vigente) y avisa por callback. */
  private async resolve(t: Incoming): Promise<void> {
    if (t.status !== 'PROCESSING') return; // cancelado mientras tanto
    const expired = new Date(t.request.expiresAt).getTime() < now().getTime();
    const amount = Number(t.request.amount);
    const reason = expired ? 'EXPIRED' : amount > 10000 || amount < 0.01 ? 'AMOUNT_LIMIT_EXCEEDED' : t.request.currency !== 'GTQ' ? 'CURRENCY_NOT_SUPPORTED'
      : this.config.mode === 'reject' ? this.config.rejectReason : null;
    t.status = reason ? 'REJECTED' : 'ACCEPTED';
    t.reasonCode = reason ?? undefined;
    t.updatedAt = now();
    this.log(reason ? 'WARN' : 'INFO', 'mock.transfer.resolved', { interbankTransferId: t.id, status: t.status, reasonCode: reason, traceId: t.traceId });
    await this.deliverCallback(t, 1);
  }

  /** Reintenta el callback con espera creciente (2 s, 4 s, 8 s...), hasta 6 intentos. */
  private async deliverCallback(t: Incoming, attempt: number): Promise<void> {
    const body = {
      interbankTransferId: t.id, destinationBankCode: this.settings.bankCode, status: t.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
      ...(t.reasonCode ? { reasonCode: t.reasonCode, reasonMessage: `Rechazo simulado (${t.reasonCode})` } : {}), processedAt: iso(t.updatedAt),
    };
    const r = await this.call('POST', `/transfers/${t.id}/result`, childTraceparent(t.traceId), body);
    t.callback = { status: r.status, attempts: attempt };
    if (r.status === 200) return;
    this.log('WARN', 'mock.callback.failed', { interbankTransferId: t.id, httpStatus: r.status, attempt, traceId: t.traceId });
    if (attempt < 6) this.schedule(() => void this.deliverCallback(t, attempt + 1), 2000 * 2 ** (attempt - 1));
  }

  private async call(method: string, path: string, traceparent: string, body: unknown, extra: Record<string, string> = {}) {
    try {
      return await this.send(method, `${this.settings.partnerBaseUrl}${path}`, { 'content-type': 'application/json', 'X-Api-Key': this.settings.outboundApiKey, traceparent, ...extra }, body);
    } catch (e) {
      this.log('WARN', 'mock.partner.unreachable', { path, error: String(e) });
      return { status: 0, body: null };
    }
  }
}
