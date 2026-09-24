import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../auth/roles.decorator';
import { CustomerController } from './customer.controller';

const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;

describe('CustomerController (Gateway) - KYC', () => {
  let calls: { url: string; init: RequestInit }[];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => JSON.stringify({ kycStatus: 'VERIFIED' }) } as Response;
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('solo ADMIN puede cambiar el estado KYC', () => {
    const roles = new Reflector().get(ROLES_KEY, CustomerController.prototype.kyc);
    expect(roles).toEqual(['ADMIN']);
  });

  it('reenvía el PATCH a Customer Service con el token y el correlationId', async () => {
    const controller = new CustomerController(config);

    await controller.kyc('CUST-7', { status: 'VERIFIED', extra: 'x' } as any, 'Bearer admin', 'corr-1');

    expect(calls[0].url).toBe('http://localhost:8081/api/customers/CUST-7/kyc');
    expect(calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ status: 'VERIFIED' });
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer admin', 'X-Correlation-Id': 'corr-1' });
  });
});
