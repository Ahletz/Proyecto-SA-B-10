import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'transfer_reservations' })
export class ReservationEntity {
  @PrimaryColumn({ name: 'transaction_id', type: 'uuid' }) transactionId: string;
  @Column({ name: 'source_account', type: 'uuid' }) sourceAccount: string;
  @Column({ name: 'target_account', type: 'uuid' }) targetAccount: string;
  @Column({ type: 'numeric', precision: 18, scale: 2 }) amount: string;
  @Column({ type: 'varchar', length: 30 }) status: 'RESERVED' | 'COMPLETED' | 'RELEASED';
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
