import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { trace } from '@opentelemetry/api';

export interface PartnerConfig { baseUrl: string; apiKey: string }
export interface HttpResult<T = any> { status: number; body: T | null; networkError?: string }

// traceparent W3C del span activo; si no hay uno, se genera para que el header (obligatorio en el contrato) siempre vaya.
export function currentTraceparent(): string {
  const ctx = trace.getActiveSpan()?.spanContext();
  if (ctx && trace.isSpanContextValid(ctx)) return `00-${ctx.traceId}-${ctx.spanId}-0${(ctx.traceFlags & 1).toString(16)}`;
  return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

// Cliente HTTP hacia el banco pareja. Configuración (Secret de Kubernetes):
//   INTERBANK_PARTNERS = {"BANK07":{"baseUrl":"https://host/interbank/v1","apiKey":"..."}}
@Injectable()
export class PartnerClient {
  private readonly logger = new Logger(PartnerClient.name);
  constructor(private readonly config: ConfigService) {}

  partners(): Record<string, PartnerConfig> {
    const raw = this.config.get<string>('INTERBANK_PARTNERS', '{}');
    try { return JSON.parse(raw) as Record<string, PartnerConfig>; } catch { return {}; }
  }

  partnerCodes(): string[] { return Object.keys(this.partners()); }

  async request<T = any>(bank: string, method: 'GET' | 'POST', path: string, opts: { body?: unknown; idempotencyKey?: string } = {}): Promise<HttpResult<T>> {
    const partner = this.partners()[bank];
    if (!partner) {
      this.logger.error({ message: 'Banco pareja sin configurar', event: 'interbank.partner_not_configured', partnerBankCode: bank });
      return { status: 0, body: null, networkError: 'PARTNER_NOT_CONFIGURED' };
    }
    const headers: Record<string, string> = { 'X-Api-Key': partner.apiKey, traceparent: currentTraceparent(), Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const timeoutMs = Number(this.config.get('INTERBANK_HTTP_TIMEOUT_MS', '5000'));
    try {
      const res = await fetch(`${partner.baseUrl.replace(/\/$/, '')}${path}`, {
        method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let body: any = null;
      if (text) { try { body = JSON.parse(text); } catch { body = null; } }
      return { status: res.status, body };
    } catch (e) {
      return { status: 0, body: null, networkError: e instanceof Error ? e.message : String(e) };
    }
  }
}
