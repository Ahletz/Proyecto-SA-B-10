import { Column, Entity, PrimaryColumn } from 'typeorm';

export type AccountType = 'MONETARY' | 'SAVINGS';
export type AccountStatus = 'ACTIVE' | 'INACTIVE';

@Entity({ name: 'accounts' })
export class AccountEntity {
  @PrimaryColumn({ name: 'account_id', type: 'uuid' }) accountId: string;
  @Column({ name: 'customer_id', type: 'varchar', length: 80 }) customerId: string;
  @Column({ type: 'varchar', length: 20 }) type: AccountType;
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 }) balance: string;
  @Column({ name: 'reserved_balance', type: 'numeric', precision: 18, scale: 2, default: 0 }) reservedBalance: string;
  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' }) status: AccountStatus;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'last_activity_at', type: 'timestamptz' }) lastActivityAt: Date;
}
