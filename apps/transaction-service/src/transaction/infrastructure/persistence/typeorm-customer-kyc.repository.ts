import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CustomerKycRepository,
  CustomerKycStatus,
  KycStatus,
} from '../../application/ports/customer-kyc.repository';
import { CustomerKycStatusOrmEntity } from './customer-kyc-status.orm-entity';

@Injectable()
export class TypeOrmCustomerKycRepository
  implements CustomerKycRepository
{
  constructor(
    @InjectRepository(CustomerKycStatusOrmEntity)
    private readonly repository: Repository<CustomerKycStatusOrmEntity>,
  ) {}

  async findByCustomerId(
    customerId: string,
  ): Promise<CustomerKycStatus | null> {
    const entity = await this.repository.findOne({
      where: {
        customerId,
      },
    });

    if (!entity) {
      return null;
    }

    return {
      customerId: entity.customerId,
      status: entity.status as KycStatus,
      updatedAt: entity.updatedAt,
    };
  }

  async save(status: CustomerKycStatus): Promise<void> {
    const entity = new CustomerKycStatusOrmEntity();

    entity.customerId = status.customerId;
    entity.status = status.status;
    entity.updatedAt = status.updatedAt;

    await this.repository.save(entity);
  }
}
