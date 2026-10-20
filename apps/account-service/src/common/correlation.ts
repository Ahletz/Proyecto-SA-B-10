import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';

export const CORRELATION_HEADER = 'X-Correlation-Id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storage = new AsyncLocalStorage<string>();

type Headers = Record<string, string | string[] | undefined>;

// Igual que el Gateway: solo se acepta un UUID; si no, se genera uno nuevo.
export function resolveCorrelationId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && UUID.test(value.trim()) ? value.trim().toLowerCase() : randomUUID();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore();
}

// Sin id (mensaje sin correlationId) se ejecuta tal cual, sin contexto.
export function runWithCorrelationId<T>(correlationId: string | undefined, fn: () => T): T {
  return correlationId ? storage.run(correlationId, fn) : fn();
}

// El Gateway reenvía X-Correlation-Id en cada llamada; este middleware lo deja
// disponible para los logs y lo anota en el span HTTP activo.
export function correlationMiddleware(
  req: { headers: Headers },
  res: { setHeader(name: string, value: string): unknown },
  next: () => void,
): void {
  const correlationId = resolveCorrelationId(req.headers['x-correlation-id']);
  res.setHeader(CORRELATION_HEADER, correlationId);
  trace.getActiveSpan()?.setAttribute('bank.correlation_id', correlationId);
  runWithCorrelationId(correlationId, next);
}
