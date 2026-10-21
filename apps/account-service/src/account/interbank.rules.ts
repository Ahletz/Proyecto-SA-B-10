// Reglas puras del lado Account del depósito interbancario (sin base de datos), fáciles de probar.
export const MAX_INTERBANK_AMOUNT = 10000;
export const MIN_INTERBANK_AMOUNT = 0.01;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX32 = /^[0-9a-f]{32}$/i;

// Número de cuenta que viaja entre bancos: el accountId (UUID) sin guiones, 32 caracteres (el contrato permite 34).
export function toExternalAccount(accountId: string): string {
  return accountId.replace(/-/g, '').toLowerCase();
}

// Acepta el UUID sin guiones (formato del acuerdo) o con guiones. Devuelve null si no es una cuenta nuestra.
export function fromExternalAccount(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (UUID.test(value)) return value.toLowerCase();
  if (!HEX32.test(value)) return null;
  const v = value.toLowerCase();
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}

export type RejectReason =
  | 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_INACTIVE' | 'AMOUNT_LIMIT_EXCEEDED' | 'CURRENCY_NOT_SUPPORTED' | 'EXPIRED' | 'CANCELLED' | 'PROCESSING_ERROR';

export interface DepositFacts {
  now: Date;
  expiresAt: Date;
  amount: number;
  currency: string | undefined;
  account: { status: string } | null;
}

// Orden de las comprobaciones al recibir un depósito. El vencimiento va primero:
// un mensaje tardío (reintento, DLQ) nunca se acredita, pase lo que pase con lo demás.
export function checkIncomingDeposit(f: DepositFacts): RejectReason | null {
  if (!(f.expiresAt instanceof Date) || Number.isNaN(f.expiresAt.getTime()) || f.now.getTime() >= f.expiresAt.getTime()) return 'EXPIRED';
  if (f.currency !== undefined && f.currency !== 'GTQ') return 'CURRENCY_NOT_SUPPORTED';
  if (!f.account) return 'ACCOUNT_NOT_FOUND';
  if (f.account.status !== 'ACTIVE') return 'ACCOUNT_INACTIVE';
  if (!Number.isFinite(f.amount) || f.amount < MIN_INTERBANK_AMOUNT) return 'PROCESSING_ERROR';
  if (f.amount > MAX_INTERBANK_AMOUNT) return 'AMOUNT_LIMIT_EXCEEDED';
  return null;
}

export type OutRejectReason = 'ACCOUNT_NOT_FOUND_OR_INACTIVE' | 'INSUFFICIENT_FUNDS' | 'AMOUNT_LIMIT_EXCEEDED' | 'INVALID_AMOUNT' | 'CURRENCY_NOT_SUPPORTED';

export function checkOutgoing(f: {
  amount: number; currency: string | undefined; source: { status: string; balance: string; reservedBalance: string; minBalance: string | null; feeAmount: string | null } | null;
}): OutRejectReason | null {
  if (!Number.isFinite(f.amount) || f.amount < MIN_INTERBANK_AMOUNT) return 'INVALID_AMOUNT';
  if (f.currency !== undefined && f.currency !== 'GTQ') return 'CURRENCY_NOT_SUPPORTED';
  if (f.amount > MAX_INTERBANK_AMOUNT) return 'AMOUNT_LIMIT_EXCEEDED';
  if (!f.source || f.source.status !== 'ACTIVE') return 'ACCOUNT_NOT_FOUND_OR_INACTIVE';
  const hold = f.amount + Number(f.source.feeAmount ?? 0);
  const available = Number(f.source.balance) - Number(f.source.reservedBalance) - Number(f.source.minBalance ?? 0);
  return available < hold ? 'INSUFFICIENT_FUNDS' : null;
}
