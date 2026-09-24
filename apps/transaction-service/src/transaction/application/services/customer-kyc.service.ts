import { Injectable } from '@nestjs/common';

import {
  CustomerKycRepository,
  KycStatus,
} from '../ports/customer-kyc.repository';

const KYC_STATUSES: readonly KycStatus[] = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
];

@Injectable()
export class CustomerKycService {
  constructor(
    private readonly customerKycRepository: CustomerKycRepository,
  ) {}

  /**
   * Aplica un cambio de estado KYC a la proyección.
   * Ignora cambios más antiguos que el último aplicado, para que
   * un evento reintentado o fuera de orden no pise un estado nuevo.
   *
   * @returns true si la proyección cambió.
   */
  async applyStatusChange(
    customerId: string,
    status: string,
    changedAt: Date,
  ): Promise<boolean> {
    if (!customerId) {
      throw new Error('customerId is required');
    }

    if (!KYC_STATUSES.includes(status as KycStatus)) {
      throw new Error(`Invalid KYC status: ${status}`);
    }

    const current =
      await this.customerKycRepository.findByCustomerId(
        customerId,
      );

    if (
      current &&
      current.updatedAt.getTime() >= changedAt.getTime()
    ) {
      return false;
    }

    await this.customerKycRepository.save({
      customerId,
      status: status as KycStatus,
      updatedAt: changedAt,
    });

    return true;
  }

  /**
   * Un cliente sin registro en la proyección se considera PENDING,
   * que es el estado inicial en Customer Service.
   */
  async isVerified(
    customerId: string | undefined,
  ): Promise<boolean> {
    if (!customerId) {
      return false;
    }

    const current =
      await this.customerKycRepository.findByCustomerId(
        customerId,
      );

    return current?.status === 'VERIFIED';
  }
}
