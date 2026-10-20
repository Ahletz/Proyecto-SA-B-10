import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { DataType, newDb } from 'pg-mem';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AccountEntity } from './account.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { InterbankOperationEntity } from './interbank-operation.entity';
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


let ds: DataSource;
let svc: InterbankService;
let published: { eventType: string; payload: any }[];

const ACC = '11111111-1111-4111-8111-111111111111';
const evt = (eventType: string, payload: any) => ({ eventId: randomUUID(), eventType, version: 1, timestamp: new Date().toISOString(), correlationId: randomUUID(), payload });
const account = async () => (await ds.getRepository(AccountEntity).findOneByOrFail({ accountId: ACC }));
const types = () => published.map((p) => p.eventType);
const last = (t: string) => published.filter((p) => p.eventType === t).at(-1)!.payload;
const inFuture = (s = 120) => new Date(Date.now() + s * 1000).toISOString();

beforeEach(async () => {
  ds = await memDb([AccountEntity, ProcessedEventEntity, InterbankOperationEntity]);
  await ds.getRepository(AccountEntity).insert({ accountId: ACC, customerId: 'c1', type: 'MONETARY', balance: '1000.00', reservedBalance: '0.00', minBalance: '0.00', feeAmount: '5.00', status: 'ACTIVE', createdAt: new Date(), lastActivityAt: new Date() });
  published = [];
  svc = new InterbankService(ds, ds.getRepository(AccountEntity), ds.getRepository(InterbankOperationEntity), ds.getRepository(ProcessedEventEntity), { publish: async (e: any) => { published.push(e); } } as any);
});

const requested = (id: string, amount = 100, extra: any = {}) =>
  evt('interbank.transfer.requested', { transactionId: id, interbankTransferId: id, sourceAccount: ACC, destinationBankCode: 'BANK07', destinationAccount: '7002-004567', amount, currency: 'GTQ', ...extra });

describe('emisor: reservar, debitar, liberar', () => {
  it('reserva monto + comisión y publica funds.reserved', async () => {
    const id = randomUUID();
    await svc.handle(requested(id, 100));
    expect(types()).toEqual(['account.interbank.funds.reserved']);
    expect(last('account.interbank.funds.reserved')).toMatchObject({ interbankTransferId: id, amount: 100, fee: 5, destinationBankCode: 'BANK07', destinationAccount: '7002-004567' });
    expect(Number((await account()).reservedBalance)).toBe(105);
  });

  it('el mismo evento repetido no reserva dos veces', async () => {
    const id = randomUUID(); const e = requested(id, 100);
    await svc.handle(e); await svc.handle(e);
    expect(Number((await account()).reservedBalance)).toBe(105);
  });

  it('otro evento para el mismo id (reintento de Transaction) tampoco reserva dos veces, pero repite la respuesta', async () => {
    const id = randomUUID();
    await svc.handle(requested(id, 100)); await svc.handle(requested(id, 100));
    expect(Number((await account()).reservedBalance)).toBe(105);
    expect(types()).toEqual(['account.interbank.funds.reserved', 'account.interbank.funds.reserved']);
  });

  it('rechaza sin fondos, sobre el límite y cuenta inexistente', async () => {
    await svc.handle(requested(randomUUID(), 5000));
    expect(last('account.interbank.funds.rejected').reason).toBe('INSUFFICIENT_FUNDS');
    await svc.handle(requested(randomUUID(), 10000.01));
    expect(last('account.interbank.funds.rejected').reason).toBe('AMOUNT_LIMIT_EXCEEDED');
    await svc.handle(requested(randomUUID(), 10, { sourceAccount: randomUUID() }));
    expect(last('account.interbank.funds.rejected').reason).toBe('ACCOUNT_NOT_FOUND_OR_INACTIVE');
    expect(Number((await account()).reservedBalance)).toBe(0);
  });

  it('accepted debita y libera lo reservado; repetirlo no debita dos veces', async () => {
    const id = randomUUID();
    await svc.handle(requested(id, 100));
    await svc.handle(evt('interbank.transfer.accepted', { transactionId: id, interbankTransferId: id }));
    await svc.handle(evt('interbank.transfer.accepted', { transactionId: id, interbankTransferId: id }));
    const a = await account();
    expect(Number(a.balance)).toBe(895);
    expect(Number(a.reservedBalance)).toBe(0);
    expect(types().filter((t) => t === 'account.interbank.transfer.completed')).toHaveLength(1);
  });

  it('rejected y reversed liberan la reserva sin tocar el saldo', async () => {
    const a1 = randomUUID(); const a2 = randomUUID();
    await svc.handle(requested(a1, 100)); await svc.handle(requested(a2, 50));
    await svc.handle(evt('interbank.transfer.rejected', { transactionId: a1, interbankTransferId: a1, reasonCode: 'ACCOUNT_NOT_FOUND' }));
    await svc.handle(evt('interbank.transfer.reversed', { transactionId: a2, interbankTransferId: a2 }));
    const a = await account();
    expect(Number(a.balance)).toBe(1000);
    expect(Number(a.reservedBalance)).toBe(0);
    expect(last('account.interbank.funds.released').reason).toBe('TIMEOUT_REVERSED');
  });

  it('un accepted tardío sobre una reserva ya liberada no debita', async () => {
    const id = randomUUID();
    await svc.handle(requested(id, 100));
    await svc.handle(evt('interbank.transfer.reversed', { transactionId: id, interbankTransferId: id }));
    await svc.handle(evt('interbank.transfer.accepted', { transactionId: id, interbankTransferId: id }));
    expect(Number((await account()).balance)).toBe(1000);
  });
});

const deposit = (id: string, extra: any = {}) =>
  evt('interbank.deposit.requested', { interbankTransferId: id, originBankCode: 'BANK07', destinationAccount: toExternalAccount(ACC), amount: '150.00', currency: 'GTQ', expiresAt: inFuture(), ...extra });

describe('receptor: acreditar', () => {
  it('acredita y publica deposit.credited', async () => {
    const id = randomUUID();
    await svc.handle(deposit(id));
    expect(types()).toEqual(['account.interbank.deposit.credited']);
    expect(Number((await account()).balance)).toBe(1150);
  });

  it('un reintento (mismo id) nunca acredita dos veces y repite la respuesta', async () => {
    const id = randomUUID();
    await svc.handle(deposit(id)); await svc.handle(deposit(id)); await svc.handle(deposit(id));
    expect(Number((await account()).balance)).toBe(1150);
    expect(types()).toEqual(Array(3).fill('account.interbank.deposit.credited'));
  });

  it('un mensaje vencido nunca acredita (EXPIRED)', async () => {
    const id = randomUUID();
    await svc.handle(deposit(id, { expiresAt: inFuture(-1) }));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('EXPIRED');
    expect(Number((await account()).balance)).toBe(1000);
    // y el reintento posterior, aunque ahora trajera una fecha válida, sigue rechazado
    await svc.handle(deposit(id));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('EXPIRED');
    expect(Number((await account()).balance)).toBe(1000);
  });

  it('cuenta inexistente, inactiva, sobre el límite y moneda no soportada', async () => {
    await svc.handle(deposit(randomUUID(), { destinationAccount: toExternalAccount(randomUUID()) }));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('ACCOUNT_NOT_FOUND');
    await svc.handle(deposit(randomUUID(), { destinationAccount: '7002-004567' }));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('ACCOUNT_NOT_FOUND');
    await svc.handle(deposit(randomUUID(), { amount: '10000.01' }));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('AMOUNT_LIMIT_EXCEEDED');
    await svc.handle(deposit(randomUUID(), { currency: 'USD' }));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('CURRENCY_NOT_SUPPORTED');
    await ds.getRepository(AccountEntity).update({ accountId: ACC }, { status: 'INACTIVE' });
    await svc.handle(deposit(randomUUID()));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('ACCOUNT_INACTIVE');
    expect(Number((await account()).balance)).toBe(1000);
  });

  it('acepta exactamente Q10,000.00', async () => {
    await svc.handle(deposit(randomUUID(), { amount: '10000.00' }));
    expect(Number((await account()).balance)).toBe(11000);
  });
});

describe('receptor: cancelación', () => {
  it('cancelar un id desconocido lo deja CANCELLED y el mensaje original, si llega después, no acredita', async () => {
    const id = randomUUID();
    expect(await svc.cancelDeposit(id)).toEqual({ result: 'CANCELLED' });
    await svc.handle(deposit(id));
    expect(last('account.interbank.deposit.rejected').reasonCode).toBe('CANCELLED');
    expect(Number((await account()).balance)).toBe(1000);
  });

  it('cancelar un depósito ya acreditado responde ALREADY_ACCEPTED y no toca el saldo', async () => {
    const id = randomUUID();
    await svc.handle(deposit(id));
    expect(await svc.cancelDeposit(id)).toEqual({ result: 'ALREADY_ACCEPTED' });
    expect(Number((await account()).balance)).toBe(1150);
  });

  it('cancelar un depósito ya rechazado responde ALREADY_REJECTED con su motivo; cancelar dos veces es idempotente', async () => {
    const id = randomUUID();
    await svc.handle(deposit(id, { amount: '20000.00' }));
    expect(await svc.cancelDeposit(id)).toEqual({ result: 'ALREADY_REJECTED', reasonCode: 'AMOUNT_LIMIT_EXCEEDED' });
    const other = randomUUID();
    expect(await svc.cancelDeposit(other)).toEqual({ result: 'CANCELLED' });
    expect(await svc.cancelDeposit(other)).toEqual({ result: 'CANCELLED' });
  });
});

describe('receptor: reverso', () => {
  it('debita lo acreditado una sola vez y publica reversal.debited', async () => {
    const id = randomUUID(); const rev = randomUUID();
    await svc.handle(deposit(id));
    await svc.handle(evt('interbank.reversal.requested', { reversalId: rev, originalTransferId: id }));
    await svc.handle(evt('interbank.reversal.requested', { reversalId: rev, originalTransferId: id }));
    expect(Number((await account()).balance)).toBe(1000);
    expect(types().filter((t) => t === 'account.interbank.reversal.debited')).toHaveLength(2);
    expect(last('account.interbank.reversal.debited')).toMatchObject({ reversalId: rev, originalTransferId: id, accountId: ACC, amount: 150 });
  });

  it('falla si el depósito original no se acreditó o ya no hay saldo', async () => {
    await svc.handle(evt('interbank.reversal.requested', { reversalId: randomUUID(), originalTransferId: randomUUID() }));
    expect(last('account.interbank.reversal.failed').reason).toBe('ORIGINAL_NOT_CREDITED');
    const id = randomUUID();
    await svc.handle(deposit(id));
    await ds.getRepository(AccountEntity).update({ accountId: ACC }, { balance: '10.00' });
    await svc.handle(evt('interbank.reversal.requested', { reversalId: randomUUID(), originalTransferId: id }));
    expect(last('account.interbank.reversal.failed').reason).toBe('INSUFFICIENT_FUNDS');
  });
});
