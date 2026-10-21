import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataType, newDb } from 'pg-mem';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { InterbankTransferEntity } from './interbank-transfer.entity';
import { InterbankReversalEntity } from './interbank-reversal.entity';
import { ProcessedEventEntity } from '../payment/processed-event.entity';
import { InterbankService } from './interbank.service';
import { toExternalAccount } from './interbank.rules';

// --- Base de datos en memoria (pg-mem) para probar la lógica real con TypeORM, sin Postgres ---
// pg-mem no soporta la introspección de TypeORM, así que las tablas se crean a mano a partir de los metadatos de las entidades.
function defaultSql(d: unknown): string {
  if (d === undefined || d === null) return '';
  const v = typeof d === 'function' ? (d as () => unknown)() : d;
  return ` default ${typeof v === 'string' && typeof d !== 'function' ? `'${v}'` : v}`;
}
async function memDb(entities: any[]): Promise<DataSource> {
  const db = newDb();
  db.public.registerFunction({ name: 'version', implementation: () => 'PostgreSQL 14.0', returns: DataType.text });
  db.public.registerFunction({ name: 'current_database', implementation: () => 'bank', returns: DataType.text });
  const ds: DataSource = await db.adapters.createTypeormDataSource({ type: 'postgres', entities, synchronize: false } as any);
  await ds.initialize();
  for (const meta of ds.entityMetadatas) {
    const cols = meta.columns.map((c) => {
      const t = String(c.type === String ? 'varchar' : c.type === Number ? 'integer' : c.type === Boolean ? 'boolean' : c.type === Date ? 'timestamptz' : c.type);
      const size = c.precision != null ? `(${c.precision}${c.scale != null ? `,${c.scale}` : ''})` : c.length ? `(${c.length})` : '';
      return `"${c.databaseName}" ${t}${t === 'uuid' || t.startsWith('timestamp') || t === 'boolean' || t === 'integer' ? '' : size}${c.isPrimary ? ' primary key' : c.isNullable ? '' : ' not null'}${defaultSql(c.default)}`;
    });
    db.public.none(`create table "${meta.tableName}" (${cols.join(', ')})`);
  }
  return ds;
}

const OWN = 'BANK03';
const PARTNER = 'BANK07';
const ACC = '11111111-1111-4111-8111-111111111111';
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

let ds: DataSource;
let svc: InterbankService;
let published: { eventType: string; payload: any }[];
let calls: { bank: string; method: string; path: string; opts: any }[];
let partner: (method: string, path: string, opts: any) => { status: number; body?: any; networkError?: string };

const evt = (eventType: string, payload: any) => ({ eventId: randomUUID(), eventType, version: 1, timestamp: new Date().toISOString(), correlationId: randomUUID(), payload });
const row = (id: string) => ds.getRepository(InterbankTransferEntity).findOneByOrFail({ id });
const types = () => published.map((p) => p.eventType);
const lastEvent = (t: string) => published.filter((p) => p.eventType === t).at(-1)!.payload;
const callsTo = (method: string, pathPart: string) => calls.filter((c) => c.method === method && c.path.includes(pathPart));
const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

const incoming = (over: Record<string, unknown> = {}) => {
  const created = new Date(); created.setMilliseconds(0);
  return {
    interbankTransferId: randomUUID(), originBankCode: PARTNER, destinationBankCode: OWN, originAccount: '7002-004567', destinationAccount: toExternalAccount(ACC),
    amount: '150.00', currency: 'GTQ', description: 'Pago', createdAt: iso(created), expiresAt: iso(new Date(created.getTime() + 180_000)), ...over,
  } as any;
};
const receive = (body: any, caller = PARTNER, key: string | undefined = body.interbankTransferId) => svc.receiveTransfer(caller, key, body);

beforeEach(async () => {
  ds = await memDb([InterbankTransferEntity, InterbankReversalEntity, ProcessedEventEntity]);
  published = []; calls = [];
  partner = () => ({ status: 200, body: {} });
  const client = {
    partnerCodes: () => [PARTNER],
    request: async (bank: string, method: string, path: string, opts: any = {}) => { calls.push({ bank, method, path, opts }); return { body: null, ...partner(method, path, opts) }; },
  };
  const config = { get: (k: string, d?: string) => ({ INTERBANK_BANK_CODE: OWN } as Record<string, string>)[k] ?? d };
  svc = new InterbankService(ds.getRepository(InterbankTransferEntity), ds.getRepository(InterbankReversalEntity), ds.getRepository(ProcessedEventEntity),
    { publish: async (e: any) => { published.push(e); } } as any, client as any, config as any);
});
afterEach(() => vi.unstubAllGlobals());

// =============================================================== RECEPTOR
describe('receptor: POST /transfers', () => {
  it('202 con PROCESSING y pide a Account acreditar', async () => {
    const body = incoming();
    const r = await receive(body);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ interbankTransferId: body.interbankTransferId, status: 'PROCESSING' });
    expect(types()).toEqual(['interbank.deposit.requested']);
    expect(lastEvent('interbank.deposit.requested')).toMatchObject({ interbankTransferId: body.interbankTransferId, originBankCode: PARTNER, destinationAccount: body.destinationAccount, amount: '150.00' });
  });

  it('repetir el mismo contenido responde 200 con el estado actual y no vuelve a pedir el depósito', async () => {
    const body = incoming();
    await receive(body);
    const again = await receive(body);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('PROCESSING');
    expect(types()).toEqual(['interbank.deposit.requested']);
  });

  it('el mismo id con contenido distinto responde 409', async () => {
    const body = incoming();
    await receive(body);
    await expect(receive({ ...body, amount: '151.00' })).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('un mensaje que llega vencido responde 422 y no se procesa', async () => {
    const created = new Date(Date.now() - 400_000); created.setMilliseconds(0);
    const body = incoming({ createdAt: iso(created), expiresAt: iso(new Date(created.getTime() + 180_000)) });
    await expect(receive(body)).rejects.toMatchObject({ status: 422, code: 'EXPIRED' });
    expect(published).toHaveLength(0);
    expect(await ds.getRepository(InterbankTransferEntity).count()).toBe(0);
  });

  it('valida formato, Idempotency-Key, banco destino y banco que llama', async () => {
    await expect(receive({ ...incoming(), amount: '150' })).rejects.toMatchObject({ status: 400 });
    const b = incoming();
    await expect(receive(b, PARTNER, randomUUID())).rejects.toMatchObject({ status: 400 });
    await expect(receive(incoming({ destinationBankCode: 'BANK09' }))).rejects.toMatchObject({ status: 400 });
    await expect(receive(incoming(), 'BANK09')).rejects.toMatchObject({ status: 401 });
    await expect(receive(incoming(), null as any)).rejects.toMatchObject({ status: 401 });
  });

  it('GET /transfers/{id}: 404 si no existe, 401 si no participa, 200 con el estado', async () => {
    const body = incoming();
    await expect(svc.getTransfer(PARTNER, body.interbankTransferId)).rejects.toMatchObject({ status: 404 });
    await receive(body);
    await expect(svc.getTransfer('BANK09', body.interbankTransferId)).rejects.toMatchObject({ status: 401 });
    expect((await svc.getTransfer(PARTNER, body.interbankTransferId)).body).toMatchObject({ status: 'PROCESSING' });
  });
});

describe('receptor: resultado de Account y callback', () => {
  it('acreditado -> ACCEPTED y se entrega el callback al emisor', async () => {
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    await svc.handleEvent(evt('account.interbank.deposit.credited', { interbankTransferId: id, accountId: ACC, amount: 150 }));
    expect((await row(id)).state).toBe('ACCEPTED');
    const cb = callsTo('POST', `/transfers/${id}/result`);
    expect(cb).toHaveLength(1);
    expect(cb[0].bank).toBe(PARTNER);
    expect(cb[0].opts.body).toMatchObject({ interbankTransferId: id, destinationBankCode: OWN, status: 'ACCEPTED' });
    expect((await row(id)).callbackState).toBe('DELIVERED');
  });

  it('rechazado -> REJECTED con su reasonCode en el callback', async () => {
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    await svc.handleEvent(evt('account.interbank.deposit.rejected', { interbankTransferId: id, reasonCode: 'ACCOUNT_NOT_FOUND', reasonMessage: 'La cuenta destino no existe' }));
    expect((await row(id)).state).toBe('REJECTED');
    expect(callsTo('POST', '/result')[0].opts.body).toMatchObject({ status: 'REJECTED', reasonCode: 'ACCOUNT_NOT_FOUND', reasonMessage: 'La cuenta destino no existe' });
  });

  it('si el emisor no responde, el callback se reintenta con espera creciente (2 s, 4 s…) hasta lograrlo', async () => {
    partner = () => ({ status: 503 });
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    await svc.handleEvent(evt('account.interbank.deposit.credited', { interbankTransferId: id, accountId: ACC, amount: 150 }));
    let r = await row(id);
    expect(r.callbackState).toBe('PENDING');
    expect(r.callbackAttempts).toBe(1);
    const wait1 = r.nextAttemptAt!.getTime() - Date.now();
    expect(wait1).toBeGreaterThan(1500); expect(wait1).toBeLessThanOrEqual(2000);

    const t2 = later(3);
    await svc.tick(t2);
    r = await row(id);
    expect(r.callbackAttempts).toBe(2);
    expect(r.nextAttemptAt!.getTime() - t2.getTime()).toBe(4000);

    partner = () => ({ status: 200 });
    await svc.tick(later(10));
    expect((await row(id)).callbackState).toBe('DELIVERED');
  });

  it('tras 24 horas sin lograr entregar el callback se marca FAILED y queda en el log', async () => {
    partner = () => ({ status: 503 });
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    await svc.handleEvent(evt('account.interbank.deposit.credited', { interbankTransferId: id, accountId: ACC, amount: 150 }));
    await svc.tick(later(25 * 3600));
    expect((await row(id)).callbackState).toBe('FAILED');
  });
});

describe('receptor: cancelación', () => {
  const account = (result: string, reasonCode?: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result, reasonCode }), { status: 200 })));
  const cancelBody = { originBankCode: PARTNER, reason: 'TIMEOUT' };

  it('un id que nunca llegó queda CANCELLED y el mensaje original, si aparece después, no se procesa', async () => {
    const body = incoming(); const id = body.interbankTransferId;
    expect((await svc.cancelTransfer(PARTNER, id, cancelBody)).body).toEqual({ interbankTransferId: id, result: 'CANCELLED' });
    const late = await receive(body);
    expect(late.status).toBe(200);
    expect(late.body).toMatchObject({ status: 'CANCELLED', reasonCode: 'CANCELLED' });
    expect(published).toHaveLength(0); // nunca se le pidió acreditar a Account
  });

  it('en proceso: Account decide. CANCELLED -> el depósito queda cancelado', async () => {
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    account('CANCELLED');
    expect((await svc.cancelTransfer(PARTNER, id, cancelBody)).body.result).toBe('CANCELLED');
    expect((await row(id)).state).toBe('CANCELLED');
  });

  it('en proceso pero Account ya lo acreditó -> ALREADY_ACCEPTED y se entrega el callback', async () => {
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    account('ALREADY_ACCEPTED');
    expect((await svc.cancelTransfer(PARTNER, id, cancelBody)).body.result).toBe('ALREADY_ACCEPTED');
    expect((await row(id)).state).toBe('ACCEPTED');
    await svc.tick(later(1));
    expect(callsTo('POST', `/transfers/${id}/result`)).toHaveLength(1);
  });

  it('en proceso pero Account ya lo rechazó -> ALREADY_REJECTED con su motivo', async () => {
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    account('ALREADY_REJECTED', 'AMOUNT_LIMIT_EXCEEDED');
    expect((await svc.cancelTransfer(PARTNER, id, cancelBody)).body.result).toBe('ALREADY_REJECTED');
    const r = await row(id);
    expect(r.state).toBe('REJECTED'); expect(r.reasonCode).toBe('AMOUNT_LIMIT_EXCEEDED');
  });

  it('es idempotente y responde según el estado final', async () => {
    const a = incoming(); await receive(a);
    await svc.handleEvent(evt('account.interbank.deposit.credited', { interbankTransferId: a.interbankTransferId, accountId: ACC, amount: 150 }));
    expect((await svc.cancelTransfer(PARTNER, a.interbankTransferId, cancelBody)).body.result).toBe('ALREADY_ACCEPTED');
    const id = randomUUID();
    await svc.cancelTransfer(PARTNER, id, cancelBody);
    expect((await svc.cancelTransfer(PARTNER, id, cancelBody)).body.result).toBe('CANCELLED');
  });

  it('si Account no responde, 503 con Retry-After (no se adivina)', async () => {
    const body = incoming(); await receive(body);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(svc.cancelTransfer(PARTNER, body.interbankTransferId, cancelBody)).rejects.toMatchObject({ status: 503, retryAfter: 5 });
    expect((await row(body.interbankTransferId)).state).toBe('PROCESSING');
  });

  it('solo puede cancelar el banco que participa', async () => {
    const body = incoming(); await receive(body);
    await expect(svc.cancelTransfer('BANK09', body.interbankTransferId, { originBankCode: 'BANK09', reason: 'TIMEOUT' })).rejects.toMatchObject({ status: 401 });
  });
});

describe('receptor: conciliación', () => {
  it('lista los depósitos del día recibidos del banco que consulta, paginados', async () => {
    for (let i = 0; i < 3; i++) await receive(incoming());
    await receive(incoming({ originBankCode: 'BANK09' }), 'BANK09');
    const today = new Date().toISOString().slice(0, 10);
    const page = (await svc.reconciliation(PARTNER, today, '1', '2')).body;
    expect(page).toMatchObject({ date: today, page: 1, pageSize: 2, totalItems: 3 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ amount: '150.00', currency: 'GTQ', status: 'PROCESSING' });
    expect((await svc.reconciliation(PARTNER, today, '2', '2')).body.items).toHaveLength(1);
    await expect(svc.reconciliation(PARTNER, 'hoy')).rejects.toMatchObject({ status: 400 });
    await expect(svc.reconciliation(PARTNER, today, '0')).rejects.toMatchObject({ status: 400 });
  });
});

// =============================================================== EMISOR
const reserved = (id: string, over: any = {}) => evt('account.interbank.funds.reserved', {
  transactionId: id, interbankTransferId: id, sourceAccount: ACC, destinationBankCode: PARTNER, destinationAccount: '7002-004567', amount: 100, fee: 5, currency: 'GTQ', description: 'x', ...over,
});
const send = async (status = 202) => {
  partner = (m, p) => (m === 'POST' && p === '/transfers' ? { status, body: { status: 'PROCESSING' } } : { status: 200, body: {} });
  const id = randomUUID();
  await svc.handleEvent(reserved(id));
  return id;
};

describe('emisor: envío', () => {
  it('envía POST /transfers con el contrato (Idempotency-Key = id, expiresAt = createdAt + 180 s) y pasa a SENT', async () => {
    const id = await send();
    const [call] = callsTo('POST', '/transfers');
    expect(call.bank).toBe(PARTNER);
    expect(call.opts.idempotencyKey).toBe(id);
    expect(call.opts.body).toMatchObject({ interbankTransferId: id, originBankCode: OWN, destinationBankCode: PARTNER, originAccount: toExternalAccount(ACC), destinationAccount: '7002-004567', amount: '100.00', currency: 'GTQ' });
    expect((Date.parse(call.opts.body.expiresAt) - Date.parse(call.opts.body.createdAt)) / 1000).toBe(180);
    expect((await row(id)).state).toBe('SENT');
    expect(types()).toEqual(['interbank.transfer.sent']);
  });

  it('si el banco pareja no está disponible reintenta con el mismo id (idempotente) hasta lograrlo', async () => {
    const id = await send(503);
    expect((await row(id)).state).toBe('PENDING');
    partner = () => ({ status: 202, body: {} });
    await svc.tick(later(3));
    expect((await row(id)).state).toBe('SENT');
    expect(callsTo('POST', '/transfers').every((c) => c.opts.idempotencyKey === id)).toBe(true);
  });

  it('un 400/401 del banco pareja rechaza la transferencia (libera la reserva)', async () => {
    const id = await send(401);
    expect((await row(id)).state).toBe('REJECTED');
    expect(types()).toContain('interbank.transfer.rejected');
  });

  it('la misma reserva reentregada no crea ni envía dos veces', async () => {
    const id = randomUUID();
    await svc.handleEvent(reserved(id)); await svc.handleEvent(reserved(id));
    expect(await ds.getRepository(InterbankTransferEntity).count()).toBe(1);
  });
});

describe('emisor: callback del banco pareja', () => {
  const cb = (id: string, status: 'ACCEPTED' | 'REJECTED', extra: any = {}) => ({ interbankTransferId: id, destinationBankCode: PARTNER, status, processedAt: iso(new Date()), ...extra });

  it('ACCEPTED confirma el débito (evento accepted); repetirlo no publica otra vez', async () => {
    const id = await send();
    expect((await svc.receiveResult(PARTNER, id, cb(id, 'ACCEPTED'))).body).toEqual({ interbankTransferId: id, received: true });
    await svc.receiveResult(PARTNER, id, cb(id, 'ACCEPTED'));
    expect((await row(id)).state).toBe('ACCEPTED');
    expect(types().filter((t) => t === 'interbank.transfer.accepted')).toHaveLength(1);
  });

  it('REJECTED libera la reserva (evento rejected con su motivo)', async () => {
    const id = await send();
    await svc.receiveResult(PARTNER, id, cb(id, 'REJECTED', { reasonCode: 'ACCOUNT_NOT_FOUND' }));
    expect((await row(id)).state).toBe('REJECTED');
    expect(lastEvent('interbank.transfer.rejected')).toMatchObject({ transactionId: id, reasonCode: 'ACCOUNT_NOT_FOUND' });
  });

  it('valida: 404 si no existe, 401 si no es su banco, 400 si el cuerpo no cuadra', async () => {
    const id = await send();
    const other = randomUUID();
    await expect(svc.receiveResult(PARTNER, other, cb(other, 'ACCEPTED'))).rejects.toMatchObject({ status: 404 });
    await expect(svc.receiveResult('BANK09', id, cb(id, 'ACCEPTED', { destinationBankCode: 'BANK09' }))).rejects.toMatchObject({ status: 401 });
    await expect(svc.receiveResult(PARTNER, id, { ...cb(id, 'ACCEPTED'), extra: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.receiveResult(PARTNER, id, cb(randomUUID(), 'ACCEPTED'))).rejects.toMatchObject({ status: 400 });
  });

  it('un callback contradictorio no cambia un estado final', async () => {
    const id = await send();
    await svc.receiveResult(PARTNER, id, cb(id, 'ACCEPTED'));
    await svc.receiveResult(PARTNER, id, cb(id, 'REJECTED'));
    expect((await row(id)).state).toBe('ACCEPTED');
  });
});

describe('emisor: protocolo de timeout', () => {
  it('sin callback antes de expiresAt pasa a TIMEOUT y la reserva sigue retenida (no se publica rejected/reversed)', async () => {
    partner = (m) => (m === 'POST' ? { status: 202 } : { status: 503 });
    const id = await send();
    await svc.tick(later(181));
    expect((await row(id)).state).toBe('TIMEOUT');
    expect(types()).toContain('interbank.transfer.timeout');
    expect(types()).not.toContain('interbank.transfer.reversed');
    expect(types()).not.toContain('interbank.transfer.rejected');
  });

  it('GET devuelve ACCEPTED -> confirma el débito', async () => {
    const id = await send();
    partner = (m, p) => (m === 'GET' && p === `/transfers/${id}` ? { status: 200, body: { status: 'ACCEPTED' } } : { status: 200 });
    await svc.tick(later(181));
    expect((await row(id)).state).toBe('ACCEPTED');
    expect(types()).toContain('interbank.transfer.accepted');
  });

  it('GET devuelve REJECTED/CANCELLED -> libera (REVERSED)', async () => {
    const id = await send();
    partner = (m) => (m === 'GET' ? { status: 200, body: { status: 'CANCELLED' } } : { status: 200 });
    await svc.tick(later(181));
    expect((await row(id)).state).toBe('REVERSED');
    expect(types()).toContain('interbank.transfer.reversed');
  });

  it('GET 404 -> POST cancel; CANCELLED -> REVERSED', async () => {
    const id = await send();
    partner = (m, p) => (m === 'GET' ? { status: 404 } : p.endsWith('/cancel') ? { status: 200, body: { result: 'CANCELLED' } } : { status: 200 });
    await svc.tick(later(181));
    expect((await row(id)).timeoutStep).toBe('CANCEL');
    await svc.tick(later(183));
    expect((await row(id)).state).toBe('REVERSED');
    const [cancel] = callsTo('POST', '/cancel');
    expect(cancel.opts.body).toEqual({ originBankCode: OWN, reason: 'TIMEOUT' });
  });

  it('GET PROCESSING -> cancel; ALREADY_ACCEPTED -> confirma el débito', async () => {
    const id = await send();
    partner = (m, p) => (m === 'GET' ? { status: 200, body: { status: 'PROCESSING' } } : p.endsWith('/cancel') ? { status: 200, body: { result: 'ALREADY_ACCEPTED' } } : { status: 200 });
    await svc.tick(later(181)); await svc.tick(later(183));
    expect((await row(id)).state).toBe('ACCEPTED');
  });

  it('cancel con ALREADY_REJECTED -> REVERSED', async () => {
    const id = await send();
    partner = (m, p) => (m === 'GET' ? { status: 404 } : p.endsWith('/cancel') ? { status: 200, body: { result: 'ALREADY_REJECTED' } } : { status: 200 });
    await svc.tick(later(181)); await svc.tick(later(183));
    expect((await row(id)).state).toBe('REVERSED');
  });

  it('receptor mudo: reintenta consulta y cancelación, y solo libera tras expiresAt + 300 s con una alerta', async () => {
    const id = await send();
    partner = () => ({ status: 0, networkError: 'ETIMEDOUT' });
    await svc.tick(later(181)); await svc.tick(later(190)); await svc.tick(later(200)); await svc.tick(later(240));
    expect((await row(id)).state).toBe('TIMEOUT');
    const r = await row(id);
    expect(callsTo('GET', `/transfers/${id}`).length).toBeGreaterThan(1);
    expect(callsTo('POST', '/cancel').length).toBeGreaterThan(0);
    await svc.tick(new Date(r.expiresAt!.getTime() + 299_000));
    expect((await row(id)).state).toBe('TIMEOUT'); // todavía dentro del margen
    await svc.tick(new Date(r.expiresAt!.getTime() + 301_000));
    const done = await row(id);
    expect(done.state).toBe('REVERSED');
    expect(done.reasonCode).toBe('TIMEOUT_NO_RESPONSE');
    expect(types()).toContain('interbank.transfer.reversed');
  });

  it('un callback ACCEPTED que llega en TIMEOUT se aplica y detiene el protocolo', async () => {
    const id = await send();
    partner = () => ({ status: 503 });
    await svc.tick(later(181));
    await svc.receiveResult(PARTNER, id, { interbankTransferId: id, destinationBankCode: PARTNER, status: 'ACCEPTED', processedAt: iso(new Date()) });
    expect((await row(id)).state).toBe('ACCEPTED');
  });

  it('ACCEPTED tardío sobre una transferencia ya REVERSED: incidente y solicitud de reverso (POST /reversals) hasta completarse', async () => {
    const id = await send();
    partner = (m) => (m === 'GET' ? { status: 404 } : { status: 200, body: { result: 'CANCELLED' } });
    await svc.tick(later(181)); await svc.tick(later(183));
    expect((await row(id)).state).toBe('REVERSED');

    const r = await svc.receiveResult(PARTNER, id, { interbankTransferId: id, destinationBankCode: PARTNER, status: 'ACCEPTED', processedAt: iso(new Date()) });
    expect(r.status).toBe(200); // corta los reintentos del banco pareja
    expect((await row(id)).state).toBe('REVERSED'); // la reserva no se vuelve a tocar

    partner = (m, p) => (m === 'POST' && p === '/reversals' ? { status: 202, body: { status: 'PROCESSING' } } : { status: 200, body: { status: 'COMPLETED', refundTransferId: randomUUID() } });
    await svc.tick(later(190));
    const [req] = callsTo('POST', '/reversals');
    expect(req.opts.body).toMatchObject({ originalTransferId: id, originBankCode: OWN, amount: '100.00', currency: 'GTQ' });
    await svc.tick(later(205));
    const revs = await ds.getRepository(InterbankReversalEntity).find();
    expect(revs).toHaveLength(1);
    expect(revs[0].state).toBe('COMPLETED');
    // pedir el reverso dos veces no crea dos
    await svc.receiveResult(PARTNER, id, { interbankTransferId: id, destinationBankCode: PARTNER, status: 'ACCEPTED', processedAt: iso(new Date()) });
    expect(await ds.getRepository(InterbankReversalEntity).count()).toBe(1);
  });
});

describe('outbox de eventos', () => {
  it('si RabbitMQ falla al cambiar de estado, el worker publica el evento después (sin perderlo ni duplicarlo)', async () => {
    let up = false;
    const svc2 = new InterbankService(ds.getRepository(InterbankTransferEntity), ds.getRepository(InterbankReversalEntity), ds.getRepository(ProcessedEventEntity),
      { publish: async (e: any) => { if (!up) throw new Error('rabbit caído'); published.push(e); } } as any,
      { partnerCodes: () => [PARTNER], request: async () => ({ status: 202, body: {} }) } as any, { get: (k: string, d?: string) => (k === 'INTERBANK_BANK_CODE' ? OWN : d) } as any);
    const id = randomUUID();
    await svc2.handleEvent(reserved(id));
    expect((await row(id)).state).toBe('SENT');
    expect((await row(id)).pendingEvent).toBe(true);
    expect(published).toHaveLength(0);
    up = true;
    await svc2.tick(later(1));
    expect(types()).toEqual(['interbank.transfer.sent']);
    await svc2.tick(later(2));
    expect(types()).toEqual(['interbank.transfer.sent']);
  });
});

// =============================================================== REVERSOS (receptor)
describe('receptor: reversos', () => {
  const credited = async () => {
    const body = incoming(); const id = body.interbankTransferId;
    await receive(body);
    await svc.handleEvent(evt('account.interbank.deposit.credited', { interbankTransferId: id, accountId: ACC, amount: 150 }));
    published = []; calls = [];
    return { id, body };
  };

  it('POST /reversals responde 202, pide a Account debitar y, al lograrlo, envía la devolución al emisor como un depósito nuevo', async () => {
    const { id, body } = await credited();
    const reversalId = randomUUID();
    const r = await svc.requestReversal(PARTNER, { reversalId, originalTransferId: id, originBankCode: PARTNER, amount: '150.00', currency: 'GTQ' });
    expect(r.status).toBe(202); expect(r.body).toMatchObject({ reversalId, status: 'PROCESSING' });
    expect(types()).toEqual(['interbank.reversal.requested']);

    partner = () => ({ status: 202, body: {} });
    await svc.handleEvent(evt('account.interbank.reversal.debited', { reversalId, originalTransferId: id, accountId: ACC, amount: 150 }));
    const [refund] = callsTo('POST', '/transfers');
    expect(refund.opts.body).toMatchObject({ originBankCode: OWN, destinationBankCode: PARTNER, originAccount: body.destinationAccount, destinationAccount: body.originAccount, amount: '150.00' });
    const status = (await svc.getReversal(PARTNER, reversalId)).body;
    expect(status).toMatchObject({ reversalId, status: 'COMPLETED', refundTransferId: refund.opts.body.interbankTransferId });
  });

  it('es idempotente por reversalId y valida (404 si no está acreditado, 400 monto distinto, 401 otro banco)', async () => {
    const { id } = await credited();
    const reversalId = randomUUID();
    const rq = { reversalId, originalTransferId: id, originBankCode: PARTNER, amount: '150.00', currency: 'GTQ' };
    await svc.requestReversal(PARTNER, rq); await svc.requestReversal(PARTNER, rq);
    expect(types().filter((t) => t === 'interbank.reversal.requested')).toHaveLength(1);
    await expect(svc.requestReversal(PARTNER, { ...rq, reversalId: randomUUID(), originalTransferId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(svc.requestReversal(PARTNER, { ...rq, reversalId: randomUUID(), amount: '99.00' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.getReversal('BANK09', reversalId)).rejects.toMatchObject({ status: 401 });
  });

  it('si Account no puede debitar el reverso queda FAILED', async () => {
    const { id } = await credited();
    const reversalId = randomUUID();
    await svc.requestReversal(PARTNER, { reversalId, originalTransferId: id, originBankCode: PARTNER, amount: '150.00', currency: 'GTQ' });
    await svc.handleEvent(evt('account.interbank.reversal.failed', { reversalId, originalTransferId: id, reason: 'INSUFFICIENT_FUNDS' }));
    expect((await svc.getReversal(PARTNER, reversalId)).body).toMatchObject({ status: 'FAILED', reasonMessage: 'INSUFFICIENT_FUNDS' });
  });
});

// =============================================================== CONCILIACIÓN (emisor)
describe('emisor: conciliación diaria', () => {
  it('compara lo enviado con lo que el banco pareja dice haber recibido y registra las diferencias', async () => {
    const a = await send(); const b = await send(); const c = await send();
    for (const id of [a, b, c]) await svc.receiveResult(PARTNER, id, { interbankTransferId: id, destinationBankCode: PARTNER, status: 'ACCEPTED', processedAt: iso(new Date()) });
    const today = new Date().toISOString().slice(0, 10);
    partner = (m, p) => (p.startsWith('/reconciliation') ? { status: 200, body: { date: today, page: 1, pageSize: 500, totalItems: 2, items: [
      { interbankTransferId: a, amount: '100.00', currency: 'GTQ', status: 'ACCEPTED', updatedAt: iso(new Date()) },
      { interbankTransferId: b, amount: '999.00', currency: 'GTQ', status: 'ACCEPTED', updatedAt: iso(new Date()) },
    ] } } : { status: 200 });
    const [res] = await svc.reconcile(today);
    expect(res.partner).toBe(PARTNER);
    expect(res.issues).toEqual(expect.arrayContaining([{ id: b, type: 'AMOUNT_MISMATCH', ours: '100.00', theirs: '999.00' }, { id: c, type: 'MISSING_AT_PARTNER', ours: 'ACCEPTED' }]));
    expect((res.issues as any[]).length).toBe(2);
  });
});

describe('módulo desactivado', () => {
  it('sin INTERBANK_BANK_CODE el worker no hace nada', async () => {
    const off = new InterbankService(ds.getRepository(InterbankTransferEntity), ds.getRepository(InterbankReversalEntity), ds.getRepository(ProcessedEventEntity),
      { publish: async () => undefined } as any, { partnerCodes: () => [], request: async () => { throw new Error('no debe llamarse'); } } as any, { get: (_k: string, d?: string) => d } as any);
    await expect(off.tick()).resolves.toBeUndefined();
  });
});
