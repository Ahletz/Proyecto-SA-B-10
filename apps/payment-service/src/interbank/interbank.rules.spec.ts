import { describe, expect, it } from 'vitest';
import {
  backoffMs, callbackDecision, deterministicUuid, diffReconciliation, hashTransfer, marginExpired, resolveCancel, resolveQuery, toExternalAccount, validateTransferRequest,
} from './interbank.rules';

const valid = () => ({
  interbankTransferId: '8f14e45f-ceea-467a-9b36-4b1c2d6a7e01', originBankCode: 'BANK03', destinationBankCode: 'BANK07', originAccount: '3001-000123', destinationAccount: '7002-004567',
  amount: '150.00', currency: 'GTQ', description: 'Pago de alquiler', createdAt: '2026-10-20T15:00:00Z', expiresAt: '2026-10-20T15:03:00Z',
});

describe('validateTransferRequest (esquema TransferRequest del contrato)', () => {
  it('acepta el ejemplo oficial del contrato', () => expect(validateTransferRequest(valid())).toEqual([]));
  it('rechaza campos faltantes, extra, patrones y moneda', () => {
    expect(validateTransferRequest({ ...valid(), interbankTransferId: 'x' })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), originBankCode: 'BANK3' })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), amount: '150' })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), amount: '0.00' })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), currency: 'USD' })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), extra: 1 })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), destinationAccount: 'a'.repeat(35) })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), description: 'x'.repeat(141) })).not.toEqual([]);
    expect(validateTransferRequest(null)).not.toEqual([]);
  });
  it('exige expiresAt = createdAt + 180 s', () => {
    expect(validateTransferRequest({ ...valid(), expiresAt: '2026-10-20T15:10:00Z' })).not.toEqual([]);
    expect(validateTransferRequest({ ...valid(), createdAt: '2026-10-20 15:00:00' })).not.toEqual([]);
  });
  it('un monto sobre Q10,000 es válido de formato (se rechaza por callback con AMOUNT_LIMIT_EXCEEDED)', () => {
    expect(validateTransferRequest({ ...valid(), amount: '15000.00' })).toEqual([]);
  });
  it('una cuenta nuestra (UUID sin guiones, 32 caracteres) cabe en el contrato', () => {
    expect(validateTransferRequest({ ...valid(), destinationAccount: toExternalAccount('11111111-1111-4111-8111-111111111111') })).toEqual([]);
  });
});

describe('idempotencia', () => {
  it('misma solicitud, misma huella; cambiar cualquier campo cambia la huella', () => {
    expect(hashTransfer(valid() as any)).toBe(hashTransfer(valid() as any));
    expect(hashTransfer({ ...valid(), amount: '151.00' } as any)).not.toBe(hashTransfer(valid() as any));
  });
  it('los ids deterministas son estables y con forma de UUID', () => {
    expect(deterministicUuid('a')).toBe(deterministicUuid('a'));
    expect(deterministicUuid('a')).not.toBe(deterministicUuid('b'));
    expect(deterministicUuid('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('backoff creciente', () => {
  it('2 s, 4 s, 8 s… con tope', () => {
    expect([0, 1, 2, 3].map((n) => backoffMs(n))).toEqual([2000, 4000, 8000, 16000]);
    expect(backoffMs(30)).toBe(15 * 60_000);
    expect(backoffMs(10, 2000, 30_000)).toBe(30_000);
  });
});

describe('callback recibido por el emisor', () => {
  it('antes del resultado final se aplica', () => {
    for (const s of ['PENDING', 'SENT', 'TIMEOUT'] as const) { expect(callbackDecision(s, 'ACCEPTED')).toBe('APPLY'); expect(callbackDecision(s, 'REJECTED')).toBe('APPLY'); }
  });
  it('repetido es idempotente; contradictorio es conflicto', () => {
    expect(callbackDecision('ACCEPTED', 'ACCEPTED')).toBe('IGNORE');
    expect(callbackDecision('ACCEPTED', 'REJECTED')).toBe('CONFLICT');
    expect(callbackDecision('REJECTED', 'REJECTED')).toBe('IGNORE');
    expect(callbackDecision('REVERSED', 'REJECTED')).toBe('IGNORE');
  });
  it('ACCEPTED sobre una transferencia ya REVERSED es un incidente que pide reverso', () => {
    expect(callbackDecision('REVERSED', 'ACCEPTED')).toBe('LATE_ACCEPTED');
    expect(callbackDecision('REJECTED', 'ACCEPTED')).toBe('LATE_ACCEPTED');
  });
});

describe('protocolo de timeout', () => {
  it('GET: ACCEPTED confirma; REJECTED/CANCELLED liberan; PROCESSING y 404 cancelan; fallas reintentan', () => {
    expect(resolveQuery({ status: 200, body: { status: 'ACCEPTED' } })).toEqual({ kind: 'ACCEPT' });
    expect(resolveQuery({ status: 200, body: { status: 'REJECTED' } })).toEqual({ kind: 'RELEASE' });
    expect(resolveQuery({ status: 200, body: { status: 'CANCELLED' } })).toEqual({ kind: 'RELEASE' });
    expect(resolveQuery({ status: 200, body: { status: 'PROCESSING' } })).toEqual({ kind: 'CANCEL' });
    expect(resolveQuery({ status: 404, body: null })).toEqual({ kind: 'CANCEL' });
    expect(resolveQuery({ status: 503, body: null })).toEqual({ kind: 'RETRY' });
    expect(resolveQuery({ status: 0, body: null, networkError: 'ECONNREFUSED' })).toEqual({ kind: 'RETRY' });
  });
  it('cancel: CANCELLED y ALREADY_REJECTED liberan; ALREADY_ACCEPTED confirma', () => {
    expect(resolveCancel({ status: 200, body: { result: 'CANCELLED' } })).toEqual({ kind: 'RELEASE' });
    expect(resolveCancel({ status: 200, body: { result: 'ALREADY_REJECTED' } })).toEqual({ kind: 'RELEASE' });
    expect(resolveCancel({ status: 200, body: { result: 'ALREADY_ACCEPTED' } })).toEqual({ kind: 'ACCEPT' });
    expect(resolveCancel({ status: 503, body: null })).toEqual({ kind: 'RETRY' });
  });
  it('sin respuesta, solo se libera después de expiresAt + 300 s', () => {
    const exp = new Date('2026-10-20T15:03:00Z');
    expect(marginExpired(exp, new Date('2026-10-20T15:03:00Z'))).toBe(false);
    expect(marginExpired(exp, new Date('2026-10-20T15:07:59Z'))).toBe(false);
    expect(marginExpired(exp, new Date('2026-10-20T15:08:00Z'))).toBe(true);
  });
});

describe('conciliación', () => {
  const o = (id: string, status: string, amount = '10.00') => ({ id, status, amount });
  it('sin diferencias', () => expect(diffReconciliation([o('a', 'ACCEPTED'), o('b', 'REVERSED')], [o('a', 'ACCEPTED'), o('b', 'CANCELLED')])).toEqual([]));
  it('detecta lo aceptado que el otro no tiene, lo que solo el otro tiene, estados y montos distintos', () => {
    const issues = diffReconciliation(
      [o('a', 'ACCEPTED'), o('b', 'REVERSED'), o('c', 'ACCEPTED', '10.00'), o('d', 'ACCEPTED')],
      [o('b', 'ACCEPTED'), o('c', 'ACCEPTED', '12.00'), o('e', 'ACCEPTED'), o('d', 'REJECTED')],
    );
    expect(issues.map((i) => `${i.id}:${i.type}`).sort()).toEqual(['a:MISSING_AT_PARTNER', 'b:STATUS_MISMATCH', 'c:AMOUNT_MISMATCH', 'd:STATUS_MISMATCH', 'e:MISSING_LOCALLY']);
  });
});
