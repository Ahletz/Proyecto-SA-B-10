import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'customer_kyc_status' })
export class CustomerKycStatusOrmEntity {
  @PrimaryColumn({
    name: 'customer_id',
    type: 'varchar',
    length: 50,
  })
  customerId: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
  })
  status: string;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt: Date;
}
