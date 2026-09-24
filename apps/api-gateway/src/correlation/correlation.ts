import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'X-Correlation-Id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storage = new AsyncLocalStorage<string>();

// Solo se acepta un UUID: Account y Transaction guardan correlation_id como uuid,
// y un valor arbitrario hacía fallar el evento en el consumidor.
export function resolveCorrelationId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && UUID.test(value.trim()) ? value.trim().toLowerCase() : randomUUID();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore();
}

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run(correlationId, fn);
}

// Cada request queda con un correlationId (el del cliente o uno nuevo), que se
// devuelve en la respuesta y que proxyJson y RabbitService propagan solos.
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = resolveCorrelationId(req.headers['x-correlation-id']);
  res.setHeader(CORRELATION_HEADER, correlationId);
  runWithCorrelationId(correlationId, next);
}
