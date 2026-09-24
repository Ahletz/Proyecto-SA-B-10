import { describe, expect, it } from 'vitest';

import {
  CustomerKycRepository,
  CustomerKycStatus,
} from '../ports/customer-kyc.repository';
import { CustomerKycService } from './customer-kyc.service';

class InMemoryCustomerKycRepository extends CustomerKycRepository {
  readonly rows = new Map<string, CustomerKycStatus>();

  async findByCustomerId(customerId: string) {
    return this.rows.get(customerId) ?? null;
  }

  async save(status: CustomerKycStatus) {
    this.rows.set(status.customerId, { ...status });
  }
}

function setup() {
  const repository = new InMemoryCustomerKycRepository();
  return { repository, service: new CustomerKycService(repository) };
}

const T1 = new Date('2026-09-01T10:00:00.000Z');
const T2 = new Date('2026-09-01T11:00:00.000Z');

describe('CustomerKycService', () => {
  it('un cliente sin registro en la proyección no está verificado', async () => {
    const { service } = setup();

    expect(await service.isVerified('CUST-1')).toBe(false);
  });

  it('sin customerId no está verificado', async () => {
    const { service } = setup();

    expect(await service.isVerified(undefined)).toBe(false);
  });

  it('aplica VERIFIED y luego un cambio posterior a REJECTED', async () => {
    const { service } = setup();

    expect(await service.applyStatusChange('CUST-1', 'VERIFIED', T1)).toBe(true);
    expect(await service.isVerified('CUST-1')).toBe(true);

    expect(await service.applyStatusChange('CUST-1', 'REJECTED', T2)).toBe(true);
    expect(await service.isVerified('CUST-1')).toBe(false);
  });

  it('ignora un evento más antiguo que el último aplicado', async () => {
    const { service, repository } = setup();

    await service.applyStatusChange('CUST-1', 'VERIFIED', T2);

    expect(await service.applyStatusChange('CUST-1', 'PENDING', T1)).toBe(false);
    expect(repository.rows.get('CUST-1')?.status).toBe('VERIFIED');
  });

  it('rechaza un estado KYC desconocido', async () => {
    const { service } = setup();

    await expect(
      service.applyStatusChange('CUST-1', 'APROBADO', T1),
    ).rejects.toThrow('Invalid KYC status');
  });
});
