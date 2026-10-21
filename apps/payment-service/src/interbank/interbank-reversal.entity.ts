import { Column, Entity, PrimaryColumn } from 'typeorm';

// Reversos (POST /reversals).
//  OUT: nosotros se lo pedimos al banco pareja (llegó un ACCEPTED tardío sobre una transferencia ya liberada).
//       PENDING -> REQUESTED -> COMPLETED | FAILED
//  IN:  el banco pareja nos lo pide a nosotros. PROCESSING -> COMPLETED | FAILED
@Entity({ name: 'interbank_reversals' })
export class InterbankReversalEntity {
  @PrimaryColumn({ name: 'reversal_id', type: 'uuid' }) id: string;
  @Column({ type: 'varchar', length: 3 }) direction: 'OUT' | 'IN';
  @Column({ name: 'original_transfer_id', type: 'uuid' }) originalTransferId: string;
  @Column({ name: 'partner_bank_code', type: 'varchar', length: 8 }) partnerBankCode: string;
  @Column({ type: 'numeric', precision: 18, scale: 2 }) amount: string;
  @Column({ type: 'varchar', length: 3, default: 'GTQ' }) currency: string;
  @Column({ type: 'varchar', length: 12 }) state: string;
  @Column({ name: 'refund_transfer_id', type: 'uuid', nullable: true }) refundTransferId: string | null;
  @Column({ name: 'reason_message', type: 'varchar', length: 200, nullable: true }) reasonMessage: string | null;
  @Column({ name: 'correlation_id', type: 'uuid' }) correlationId: string;
  @Column({ type: 'integer', default: 0 }) attempts: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true }) nextAttemptAt: Date | null;
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true }) lockedUntil: Date | null;
  @Column({ name: 'pending_event', type: 'boolean', default: false }) pendingEvent: boolean;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
