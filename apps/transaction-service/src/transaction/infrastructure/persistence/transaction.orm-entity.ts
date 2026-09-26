import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { TransactionStatus } from '../../domain/enums/transaction-status.enum';

@Entity({ name: 'transactions' })
@Index('idx_transactions_source_created', ['sourceAccount', 'createdAt'])
@Index('idx_transactions_target_created', ['targetAccount', 'createdAt'])
export class TransactionOrmEntity {
  @PrimaryColumn({
    name: 'transaction_id',
    type: 'uuid',
  })
  transactionId: string;

  @Column({
    name: 'source_account',
    type: 'varchar',
    length: 100,
  })
  sourceAccount: string;

  @Column({
    name: 'target_account',
    type: 'varchar',
    length: 100,
  })
  targetAccount: string;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  amount: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
  })
  status: TransactionStatus;

  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  failureReason: string | null;

  @Column({
    name: 'correlation_id',
    type: 'uuid',
    unique: true,
  })
  correlationId: string;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt: Date;
}
