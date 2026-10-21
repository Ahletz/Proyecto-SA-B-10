import { createServer, IncomingMessage, ServerResponse } from 'http';
import { timingSafeEqual } from 'crypto';
import { MockBank, Mode, Reply, Send, Log } from './bank';

// Servidor HTTP del banco simulado. Rutas del contrato bajo /interbank/v1 (con X-Api-Key) y rutas
// /admin/* (con X-Admin-Token) para cambiar el modo de fallo en caliente y para enviarnos depósitos.
// El Service es ClusterIP: /admin solo se usa con kubectl port-forward, nunca se publica.

const env = (k: string, d = '') => process.env[k] ?? d;
const SERVICE = 'interbank-mock';

const log: Log = (level, event, fields) => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(), level, serviceName: SERVICE, environment: env('DEPLOY_ENV', 'dev'), version: env('APP_VERSION', 'unknown'),
    correlationId: '', traceId: fields.traceId ?? '', spanId: '', message: event, event, ...fields,
  })}\n`);
};

const send: Send = async (method, url, headers, body) => {
  const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* texto plano */ }
  return { status: r.status, body: parsed };
};

const bank = new MockBank(
  {
    bankCode: env('MOCK_BANK_CODE', 'BANK99'),
    partnerBankCode: env('PARTNER_BANK_CODE', 'BANK08'),
    partnerBaseUrl: env('PARTNER_BASE_URL', 'http://api-gateway:8080/interbank/v1'),
    outboundApiKey: env('MOCK_OUTBOUND_API_KEY'),
  },
  {
    mode: env('MOCK_MODE', 'accept') as Mode,
    latencyMs: Number(env('MOCK_LATENCY_MS', '0')),
    callbackDelayMs: Number(env('MOCK_CALLBACK_DELAY_MS', '1000')),
    rejectReason: env('MOCK_REJECT_REASON', 'ACCOUNT_NOT_FOUND'),
  },
  send,
  log,
);

const sameSecret = (expected: string, given: string | undefined) => {
  if (!expected || !given) return false;
  const a = Buffer.from(expected); const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};
const header = (req: IncomingMessage, name: string) => {
  const v = req.headers[name]; return Array.isArray(v) ? v[0] : v;
};
const readJson = (req: IncomingMessage) => new Promise<unknown>((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 64_000) req.destroy(); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(undefined); } });
});
const write = (res: ServerResponse, r: Reply) => {
  res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) });
  res.end(JSON.stringify(r.body));
};
const fail = (status: number, code: string, message: string): Reply => ({ status, body: { code, message, timestamp: new Date().toISOString() } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function contract(req: IncomingMessage, path: string, query: URLSearchParams): Promise<Reply> {
  const m = req.method ?? 'GET';
  if (m === 'GET' && path === '/health') return bank.health();
  if (!sameSecret(env('MOCK_INBOUND_API_KEY'), header(req, 'x-api-key'))) return fail(401, 'UNAUTHORIZED', 'API key ausente o inválida');
  const down = bank.unavailable();
  if (down) return down;
  if (bank.config.latencyMs > 0) await sleep(bank.config.latencyMs);

  const body = m === 'POST' ? await readJson(req) : undefined;
  if (m === 'POST' && body === undefined) return fail(400, 'VALIDATION_ERROR', 'JSON inválido');
  let p: RegExpExecArray | null;
  if (m === 'POST' && path === '/transfers') return bank.receiveTransfer(header(req, 'idempotency-key'), header(req, 'traceparent'), body);
  if (m === 'GET' && (p = /^\/transfers\/([^/]+)$/.exec(path))) return bank.getTransfer(p[1]);
  if (m === 'POST' && (p = /^\/transfers\/([^/]+)\/cancel$/.exec(path))) return bank.cancelTransfer(p[1], body);
  if (m === 'POST' && (p = /^\/transfers\/([^/]+)\/result$/.exec(path))) return bank.receiveResult(p[1], body);
  if (m === 'POST' && path === '/reversals') return bank.requestReversal(body);
  if (m === 'GET' && (p = /^\/reversals\/([^/]+)$/.exec(path))) return bank.getReversal(p[1]);
  if (m === 'GET' && path === '/reconciliation') return bank.reconciliation(query.get('date') ?? undefined, Number(query.get('page') ?? 1), Number(query.get('pageSize') ?? 100));
  return fail(404, 'NOT_FOUND', 'Ruta no definida en el contrato');
}

async function admin(req: IncomingMessage, path: string): Promise<Reply> {
  if (!sameSecret(env('MOCK_ADMIN_TOKEN'), header(req, 'x-admin-token'))) return fail(401, 'UNAUTHORIZED', 'X-Admin-Token ausente o inválido');
  const m = req.method ?? 'GET';
  if (m === 'GET' && path === '/state') return { status: 200, body: bank.snapshot() };
  if (m === 'POST' && path === '/config') {
    const r = bank.setConfig(((await readJson(req)) ?? {}) as Record<string, never>);
    return typeof r === 'string' ? fail(400, 'VALIDATION_ERROR', r) : { status: 200, body: r };
  }
  if (m === 'POST' && path === '/send') {
    const b = ((await readJson(req)) ?? {}) as Record<string, any>;
    if (typeof b.destinationAccount !== 'string' || !/^[0-9]{1,5}\.[0-9]{2}$/.test(b.amount ?? '')) return fail(400, 'VALIDATION_ERROR', 'destinationAccount y amount ("0.00") son obligatorios');
    return { status: 200, body: await bank.sendTransfer(b.destinationAccount, b.amount, b.description) };
  }
  return fail(404, 'NOT_FOUND', 'Ruta admin desconocida');
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://mock');
  try {
    if (url.pathname === '/health') return write(res, { status: 200, body: { status: 'UP' } });
    if (url.pathname.startsWith('/interbank/v1/')) {
      const r = await contract(req, url.pathname.slice('/interbank/v1'.length), url.searchParams);
      // Cada rechazo queda en el log con su motivo: es la evidencia de por qué el banco pareja respondió así.
      if (r.status >= 400) log('WARN', 'mock.request.rejected', { method: req.method, path: url.pathname, httpStatus: r.status, ...(r.body as object) });
      return write(res, r);
    }
    if (url.pathname.startsWith('/admin/')) return write(res, await admin(req, url.pathname.slice('/admin'.length)));
    write(res, fail(404, 'NOT_FOUND', 'Ruta desconocida'));
  } catch (e) {
    log('ERROR', 'mock.unexpected_error', { path: url.pathname, error: String(e) });
    write(res, fail(503, 'SERVICE_UNAVAILABLE', 'Error interno del mock'));
  }
}).listen(Number(env('PORT', '3010')), () => log('INFO', 'mock.started', { bankCode: env('MOCK_BANK_CODE', 'BANK99'), mode: bank.config.mode }));
