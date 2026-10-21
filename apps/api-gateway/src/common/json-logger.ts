import type { LoggerService } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { currentCorrelationId } from '../correlation/correlation';

const SERVICE_NAME = 'api-gateway';

// Campos que nunca se escriben, ni siquiera enmascarados.
const SECRET_KEY = /pass(word)?|secret|token|authorization|api[-_]?key|cookie|jwt|photo|foto/i;
// Documentos de identidad: solo los últimos 4 dígitos.
const DOCUMENT_KEY = /^(dpi|documento|document(number)?|nit)$/i;
const EMAIL_KEY = /e-?mail/i;
const MAX_DEPTH = 6;

export function maskEmail(value: string): string {
  const [user, domain] = value.split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
}

export function maskDocument(value: unknown): string {
  const s = String(value);
  return s.length <= 4 ? '****' : `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}

// Enmascara correos y tokens Bearer dentro de texto libre.
export function maskText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => maskEmail(m));
}

export function maskSensitive(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return maskText(value);
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) out[key] = '***';
    else if (DOCUMENT_KEY.test(key) && val != null) out[key] = maskDocument(val);
    else if (EMAIL_KEY.test(key) && typeof val === 'string') out[key] = maskEmail(val);
    else out[key] = maskSensitive(val, depth + 1);
  }
  return out;
}

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// Logger de Nest que escribe una línea JSON por stdout con los campos de la
// convención (timestamp, level, serviceName, environment, version, correlationId,
// traceId, spanId, message). Uso: NestFactory.create(AppModule, { logger: new JsonLogger() }).
export class JsonLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]) { this.write('INFO', message, params); }
  warn(message: unknown, ...params: unknown[]) { this.write('WARN', message, params); }
  debug(message: unknown, ...params: unknown[]) { this.write('DEBUG', message, params); }
  verbose(message: unknown, ...params: unknown[]) { this.write('DEBUG', message, params); }
  error(message: unknown, ...params: unknown[]) { this.write('ERROR', message, params); }
  fatal(message: unknown, ...params: unknown[]) { this.write('ERROR', message, params); }

  private write(level: Level, message: unknown, params: unknown[]) {
    process.stdout.write(`${JSON.stringify(buildLogLine(level, message, params))}\n`);
  }
}

export function buildLogLine(level: Level, message: unknown, params: unknown[] = []): Record<string, unknown> {
  const span = trace.getActiveSpan()?.spanContext();
  const validSpan = span && trace.isSpanContextValid(span) ? span : undefined;

  // Nest manda el contexto como último parámetro string; en error() el anterior es el stack.
  const rest = [...params];
  const context = typeof rest[rest.length - 1] === 'string' && rest.length > 0 ? (rest.pop() as string) : undefined;
  const stack = level === 'ERROR' && typeof rest[0] === 'string' ? (rest.shift() as string) : undefined;

  let text = '';
  let event: string | undefined;
  let data: unknown;
  let errorInfo: { message: string; stack?: string } | undefined;

  if (message instanceof Error) {
    text = message.message;
    errorInfo = { message: message.message, stack: message.stack };
  } else if (message && typeof message === 'object') {
    const { message: m, event: e, ...others } = message as Record<string, unknown>;
    text = typeof m === 'string' ? m : '';
    event = typeof e === 'string' ? e : undefined;
    if (Object.keys(others).length) data = others;
  } else {
    text = String(message);
  }
  if (rest.length) data = data ? { ...(data as object), extra: rest } : { extra: rest };
  if (stack) errorInfo = { message: text, stack };

  return {
    timestamp: new Date().toISOString(),
    level,
    serviceName: SERVICE_NAME,
    environment: process.env.DEPLOY_ENV ?? 'dev',
    version: process.env.APP_VERSION ?? 'unknown',
    correlationId: currentCorrelationId() ?? '',
    traceId: validSpan?.traceId ?? '',
    spanId: validSpan?.spanId ?? '',
    message: maskText(text),
    ...(context ? { context } : {}),
    ...(event ? { event } : {}),
    ...(data !== undefined ? { data: maskSensitive(data) } : {}),
    ...(errorInfo ? { error: { message: maskText(errorInfo.message), ...(errorInfo.stack ? { stack: errorInfo.stack } : {}) } } : {}),
  };
}
