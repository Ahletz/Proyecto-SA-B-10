import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyJson } from './proxy.util';

describe('proxyJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('servicio interno caído (fetch falla) -> 503, no 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));

    await expect(proxyJson('http://account-service:3004', '/api/accounts/A', 'GET')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
