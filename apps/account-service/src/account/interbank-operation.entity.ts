import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// Una fila por transferencia interbancaria que toca una cuenta de este banco.
//  OUT (somos emisor):  RESERVED -> DEBITED | RELEASED   (o REJECTED si nunca se reservó)
//  IN  (somos receptor): CREDITED | REJECTED | CANCELLED  (CREDITED -> REFUNDED si hubo reverso)
// La clave primaria es interbankTransferId: con ella el reintento de un mismo depósito nunca acredita dos veces.
export type InterbankDirection = 'OUT' | 'IN';
export type InterbankOpStatus = 'RESERVED' | 'DEBITED' | 'RELEASED' | 'CREDITED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';

@Entity({ name: 'interbank_operations' })
@Index(['direction', 'status'])
export class InterbankOperationEntity {
  @PrimaryColumn({ name: 'interbank_transfer_id', type: 'uuid' }) interbankTransferId: string;
  @Column({ type: 'varchar', length: 3 }) direction: InterbankDirection;
  @Column({ name: 'account_id', type: 'varchar', length: 40, nullable: true }) accountId: string | null;
  @Column({ name: 'partner_bank_code', type: 'varchar', length: 8, nullable: true }) partnerBankCode: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 }) amount: string;
  @Column({ name: 'fee_amount', type: 'numeric', precision: 18, scale: 2, default: 0 }) feeAmount: string;
  @Column({ type: 'varchar', length: 20 }) status: InterbankOpStatus;
  @Column({ name: 'reason_code', type: 'varchar', length: 40, nullable: true }) reasonCode: string | null;
  @Column({ name: 'transaction_id', type: 'varchar', length: 40, nullable: true }) transactionId: string | null;
  @Column({ name: 'reversal_id', type: 'varchar', length: 40, nullable: true }) reversalId: string | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
