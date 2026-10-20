import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// Una fila por depósito interbancario, en cualquiera de los dos roles.
//  OUT (somos emisor):   PENDING -> SENT -> ACCEPTED | REJECTED | TIMEOUT -> (ACCEPTED | REVERSED)
//  IN  (somos receptor): PROCESSING -> ACCEPTED | REJECTED | CANCELLED
// La clave primaria es el interbankTransferId (= Idempotency-Key).
@Entity({ name: 'interbank_transfers' })
@Index(['direction', 'state'])
@Index(['partnerBankCode', 'createdAt'])
export class InterbankTransferEntity {
  @PrimaryColumn({ name: 'interbank_transfer_id', type: 'uuid' }) id: string;
  @Column({ type: 'varchar', length: 3 }) direction: 'OUT' | 'IN';
  @Column({ name: 'partner_bank_code', type: 'varchar', length: 8 }) partnerBankCode: string;
  @Column({ name: 'origin_account', type: 'varchar', length: 40, nullable: true }) originAccount: string | null;
  @Column({ name: 'destination_account', type: 'varchar', length: 40, nullable: true }) destinationAccount: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 }) amount: string;
  @Column({ type: 'varchar', length: 3, default: 'GTQ' }) currency: string;
  @Column({ type: 'varchar', length: 140, nullable: true }) description: string | null;
  // createdAt / expiresAt del mensaje del contrato (null en filas creadas solo por una cancelación previa).
  @Column({ name: 'message_created_at', type: 'timestamptz', nullable: true }) messageCreatedAt: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'varchar', length: 20 }) state: string;
  @Column({ name: 'reason_code', type: 'varchar', length: 40, nullable: true }) reasonCode: string | null;
  @Column({ name: 'reason_message', type: 'varchar', length: 200, nullable: true }) reasonMessage: string | null;
  @Column({ name: 'request_hash', type: 'varchar', length: 64, nullable: true }) requestHash: string | null;
  @Column({ name: 'transaction_id', type: 'uuid', nullable: true }) transactionId: string | null;
  @Column({ name: 'correlation_id', type: 'uuid' }) correlationId: string;
  @Column({ name: 'is_refund', type: 'boolean', default: false }) isRefund: boolean;
  // Envío (OUT) / reintentos
  @Column({ name: 'send_attempts', type: 'integer', default: 0 }) sendAttempts: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true }) nextAttemptAt: Date | null;
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true }) lockedUntil: Date | null;
  // Protocolo de timeout (OUT)
  @Column({ name: 'timeout_at', type: 'timestamptz', nullable: true }) timeoutAt: Date | null;
  @Column({ name: 'timeout_step', type: 'varchar', length: 10, nullable: true }) timeoutStep: 'QUERY' | 'CANCEL' | null;
  @Column({ name: 'step_attempts', type: 'integer', default: 0 }) stepAttempts: number;
  // Callback hacia el emisor (IN)
  @Column({ name: 'callback_state', type: 'varchar', length: 10, nullable: true }) callbackState: 'PENDING' | 'DELIVERED' | 'FAILED' | null;
  @Column({ name: 'callback_attempts', type: 'integer', default: 0 }) callbackAttempts: number;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt: Date | null;
  // Evento pendiente de publicar (outbox): se publica con un eventId determinista, así reenviarlo es inocuo.
  @Column({ name: 'pending_event', type: 'boolean', default: false }) pendingEvent: boolean;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
