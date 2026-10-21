import { describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { MockBank, Send } from './bank';

const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

function setup(mode: 'accept' | 'reject' | 'no-callback' = 'accept') {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const send: Send = async (_m, url, headers, body) => { calls.push({ url, headers, body }); return { status: 200, body: {} }; };
  const pending: (() => void)[] = [];
  const bank = new MockBank(
    { bankCode: 'BANK99', partnerBankCode: 'BANK08', partnerBaseUrl: 'https://bank08/interbank/v1', outboundApiKey: 'k99' },
    { mode, latencyMs: 0, callbackDelayMs: 0, rejectReason: 'ACCOUNT_NOT_FOUND' },
    send, () => {}, (fn) => { pending.push(fn); },
  );
  const flush = async () => { while (pending.length) { pending.shift()!(); await new Promise((r) => setImmediate(r)); } };
  return { bank, calls, flush };
}

function transfer(overrides: Record<string, unknown> = {}) {
  const created = new Date();
  return {
    interbankTransferId: randomUUID(), originBankCode: 'BANK08', destinationBankCode: 'BANK99', originAccount: 'a'.repeat(32),
    destinationAccount: 'MOCK-0001', amount: '150.00', currency: 'GTQ', createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + 180_000).toISOString(), ...overrides,
  };
}

describe('MockBank (banco pareja simulado)', () => {
  it('acepta, avisa por callback con el mismo traceId y no procesa dos veces el mismo id', async () => {
    const { bank, calls, flush } = setup();
    const t = transfer();

    expect(bank.receiveTransfer(t.interbankTransferId, traceparent, t).status).toBe(202);
    await flush();
    expect(calls[0].url).toBe(`https://bank08/interbank/v1/transfers/${t.interbankTransferId}/result`);
    expect(calls[0].body.status).toBe('ACCEPTED');
    expect(calls[0].headers['X-Api-Key']).toBe('k99');
    expect(calls[0].headers.traceparent.slice(3, 35)).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

    const repeated = bank.receiveTransfer(t.interbankTransferId, traceparent, t);
    expect(repeated.status).toBe(200);
    expect(bank.receiveTransfer(t.interbankTransferId, traceparent, { ...t, amount: '151.00' }).status).toBe(409);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('modo reject rechaza con el motivo configurado; un mensaje vencido responde 422', async () => {
    const { bank, calls, flush } = setup('reject');
    const t = transfer();
    bank.receiveTransfer(t.interbankTransferId, traceparent, t);
    await flush();
    expect(calls[0].body).toMatchObject({ status: 'REJECTED', reasonCode: 'ACCOUNT_NOT_FOUND' });

    const old = transfer({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(bank.receiveTransfer(old.interbankTransferId, traceparent, old).status).toBe(422);
  });

  it('modo no-callback deja PROCESSING; cancelar responde CANCELLED y una llegada tardía se rechaza', async () => {
    const { bank, calls, flush } = setup('no-callback');
    const t = transfer();
    bank.receiveTransfer(t.interbankTransferId, traceparent, t);
    await flush();
    expect(calls).toHaveLength(0);
    expect((bank.getTransfer(t.interbankTransferId).body as any).status).toBe('PROCESSING');
    expect((bank.cancelTransfer(t.interbankTransferId, { originBankCode: 'BANK08', reason: 'TIMEOUT' }).body as any).result).toBe('CANCELLED');

    const late = transfer();
    bank.cancelTransfer(late.interbankTransferId, { originBankCode: 'BANK08', reason: 'TIMEOUT' });
    expect(bank.receiveTransfer(late.interbankTransferId, traceparent, late).status).toBe(202);
    await flush();
    expect(calls[0].body).toMatchObject({ status: 'REJECTED', reasonCode: 'CANCELLED' });
  });
});
