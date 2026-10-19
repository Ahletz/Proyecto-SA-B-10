// Reglas puras del contrato interbancario (sin base de datos ni red): validación, idempotencia, máquina de estados,
// protocolo de timeout y conciliación. Todo lo que el contrato fija vive aquí para poder probarlo de forma aislada.
import { createHash } from 'crypto';

export const MAX_AMOUNT = 10000;
export const TTL_SECONDS = 180; // expiresAt = createdAt + 180 s
export const TIMEOUT_MARGIN_SECONDS = 300; // sin respuesta del receptor: liberar solo tras expiresAt + 300 s

export type OutState = 'PENDING' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'TIMEOUT' | 'REVERSED';
export type InState = 'PROCESSING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANK = /^BANK[0-9]{2}$/;
const ACCOUNT = /^[A-Za-z0-9-]{1,34}$/;
const AMOUNT = /^[0-9]{1,5}\.[0-9]{2}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const isBankCode = (v: unknown): v is string => typeof v === 'string' && BANK.test(v);
export const isTraceparent = (v: unknown): v is string => typeof v === 'string' && TRACEPARENT.test(v);

// Número de cuenta entre bancos: accountId (UUID) sin guiones, 32 caracteres (el contrato permite hasta 34).
export const toExternalAccount = (accountId: string) => accountId.replace(/-/g, '').toLowerCase();

export const formatAmount = (v: number | string) => Number(v).toFixed(2);

export function deterministicUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface TransferRequest {
  interbankTransferId: string;
  originBankCode: string;
  destinationBankCode: string;
  originAccount: string;
  destinationAccount: string;
  amount: string;
  currency: 'GTQ';
  description?: string;
  createdAt: string;
  expiresAt: string;
}

const TRANSFER_FIELDS = ['interbankTransferId', 'originBankCode', 'destinationBankCode', 'originAccount', 'destinationAccount', 'amount', 'currency', 'description', 'createdAt', 'expiresAt'];

// Valida el cuerpo de POST /transfers según el esquema TransferRequest. Devuelve la lista de errores (vacía = válido).
export function validateTransferRequest(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return ['El cuerpo debe ser un objeto JSON'];
  const b = body as Record<string, unknown>;
  const errors: string[] = [];
  for (const k of Object.keys(b)) if (!TRANSFER_FIELDS.includes(k)) errors.push(`Campo no permitido: ${k}`);
  if (!isUuid(b.interbankTransferId)) errors.push('interbankTransferId debe ser un UUID');
  if (!isBankCode(b.originBankCode)) errors.push('originBankCode inválido (BANKnn)');
  if (!isBankCode(b.destinationBankCode)) errors.push('destinationBankCode inválido (BANKnn)');
  if (typeof b.originAccount !== 'string' || !ACCOUNT.test(b.originAccount)) errors.push('originAccount inválido');
  if (typeof b.destinationAccount !== 'string' || !ACCOUNT.test(b.destinationAccount)) errors.push('destinationAccount inválido');
  if (typeof b.amount !== 'string' || !AMOUNT.test(b.amount)) errors.push('amount debe ser texto con dos decimales (p. ej. "150.00")');
  else if (Number(b.amount) < 0.01) errors.push('amount mínimo 0.01');
  if (b.currency !== 'GTQ') errors.push('currency debe ser GTQ');
  if (b.description !== undefined && (typeof b.description !== 'string' || b.description.length > 140)) errors.push('description máximo 140 caracteres');
  const created = typeof b.createdAt === 'string' && ISO_UTC.test(b.createdAt) ? Date.parse(b.createdAt) : NaN;
  const expires = typeof b.expiresAt === 'string' && ISO_UTC.test(b.expiresAt) ? Date.parse(b.expiresAt) : NaN;
  if (Number.isNaN(created)) errors.push('createdAt debe ser fecha ISO 8601 en UTC');
  if (Number.isNaN(expires)) errors.push('expiresAt debe ser fecha ISO 8601 en UTC');
  if (!Number.isNaN(created) && !Number.isNaN(expires) && Math.abs((expires - created) / 1000 - TTL_SECONDS) > 5) {
    errors.push('expiresAt debe ser createdAt + 180 segundos');
  }
  return errors;
}

// Huella del contenido: mismo id + misma huella = repetición idempotente; misma id + otra huella = 409.
export function hashTransfer(r: TransferRequest): string {
  const canonical = [r.interbankTransferId, r.originBankCode, r.destinationBankCode, r.originAccount, r.destinationAccount, r.amount, r.currency, r.description ?? '', r.createdAt, r.expiresAt].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

// ---- Backoff: 2 s, 4 s, 8 s… con tope. attempt empieza en 0. ----
export function backoffMs(attempt: number, baseMs = 2000, capMs = 15 * 60_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
}

// ---- Callback recibido por el emisor ----
export type CallbackDecision = 'APPLY' | 'IGNORE' | 'CONFLICT' | 'LATE_ACCEPTED';

export function callbackDecision(state: OutState, status: 'ACCEPTED' | 'REJECTED'): CallbackDecision {
  if (state === 'PENDING' || state === 'SENT' || state === 'TIMEOUT') return 'APPLY';
  if (state === 'ACCEPTED') return status === 'ACCEPTED' ? 'IGNORE' : 'CONFLICT';
  // REJECTED o REVERSED: la reserva ya se liberó. Un ACCEPTED posterior es el caso del reverso.
  return status === 'ACCEPTED' ? 'LATE_ACCEPTED' : 'IGNORE';
}

// ---- Protocolo de timeout (emisor) ----
export type Resolution = { kind: 'ACCEPT' } | { kind: 'RELEASE' } | { kind: 'CANCEL' } | { kind: 'RETRY' };

// Respuesta de GET /transfers/{id} del receptor.
export function resolveQuery(res: { status: number; body?: { status?: string } | null; networkError?: string }): Resolution {
  if (res.networkError) return { kind: 'RETRY' };
  if (res.status === 200) {
    switch (res.body?.status) {
      case 'ACCEPTED': return { kind: 'ACCEPT' };
      case 'REJECTED':
      case 'CANCELLED': return { kind: 'RELEASE' };
      case 'PROCESSING': return { kind: 'CANCEL' };
      default: return { kind: 'RETRY' };
    }
  }
  if (res.status === 404) return { kind: 'CANCEL' };
  return { kind: 'RETRY' };
}

// Respuesta de POST /transfers/{id}/cancel.
export function resolveCancel(res: { status: number; body?: { result?: string } | null; networkError?: string }): Resolution {
  if (res.networkError || res.status !== 200) return { kind: 'RETRY' };
  switch (res.body?.result) {
    case 'CANCELLED':
    case 'ALREADY_REJECTED': return { kind: 'RELEASE' };
    case 'ALREADY_ACCEPTED': return { kind: 'ACCEPT' };
    default: return { kind: 'RETRY' };
  }
}

// Si el receptor no responde, solo se libera la reserva después de expiresAt + 300 s (y con alerta).
export function marginExpired(expiresAt: Date, now: Date, marginSeconds = TIMEOUT_MARGIN_SECONDS): boolean {
  return now.getTime() >= expiresAt.getTime() + marginSeconds * 1000;
}

// ---- Conciliación diaria ----
export interface ReconItem { id: string; amount: string; status: string }
export interface ReconIssue { id: string; type: 'MISSING_AT_PARTNER' | 'MISSING_LOCALLY' | 'STATUS_MISMATCH' | 'AMOUNT_MISMATCH'; ours?: string; theirs?: string }

// `ours` son nuestras transferencias enviadas ese día (estado interno OUT); `theirs` lo que el receptor dice haber recibido.
export function diffReconciliation(ours: ReconItem[], theirs: ReconItem[]): ReconIssue[] {
  const issues: ReconIssue[] = [];
  const t = new Map(theirs.map((x) => [x.id, x]));
  const o = new Map(ours.map((x) => [x.id, x]));
  for (const mine of ours) {
    const other = t.get(mine.id);
    const accepted = mine.status === 'ACCEPTED';
    if (!other) {
      if (accepted) issues.push({ id: mine.id, type: 'MISSING_AT_PARTNER', ours: mine.status });
      continue;
    }
    if (formatAmount(mine.amount) !== formatAmount(other.amount)) issues.push({ id: mine.id, type: 'AMOUNT_MISMATCH', ours: formatAmount(mine.amount), theirs: formatAmount(other.amount) });
    const theyAccepted = other.status === 'ACCEPTED';
    if (accepted !== theyAccepted) issues.push({ id: mine.id, type: 'STATUS_MISMATCH', ours: mine.status, theirs: other.status });
  }
  for (const other of theirs) {
    if (!o.has(other.id) && other.status === 'ACCEPTED') issues.push({ id: other.id, type: 'MISSING_LOCALLY', theirs: other.status });
  }
  return issues;
}
