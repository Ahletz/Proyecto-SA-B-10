export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface CustomerKycStatus {
  customerId: string;
  status: KycStatus;
  updatedAt: Date;
}

/**
 * Proyección local del estado KYC de cada cliente, alimentada por
 * `customer.kyc.status.changed`. Evita consultar a Customer Service
 * de forma síncrona durante la Saga.
 */
export abstract class CustomerKycRepository {
  abstract findByCustomerId(
    customerId: string,
  ): Promise<CustomerKycStatus | null>;

  abstract save(status: CustomerKycStatus): Promise<void>;
}
