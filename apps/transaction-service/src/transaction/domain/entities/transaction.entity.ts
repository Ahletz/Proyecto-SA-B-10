import { TransactionStatus } from '../enums/transaction-status.enum';
import {
  INTERBANK_STAGE,
  InterbankState,
  isFinalInterbankState,
} from '../enums/interbank-state.enum';

export class Transaction {
  constructor(
    public readonly transactionId: string,
    public readonly sourceAccount: string,
    public readonly targetAccount: string,
    public readonly amount: number,
    private _status: TransactionStatus,
    public readonly correlationId: string,
    public readonly createdAt: Date,
    private _updatedAt: Date,
    private _failureReason: string | null = null,
    // Solo en depósitos interbancarios: banco destino (BANKnn) y estado
    // frente al banco pareja; targetAccount es la cuenta en ese banco.
    public readonly destinationBankCode: string | null = null,
    private _interbankState: InterbankState | null = null,
  ) {
    if (!transactionId) {
      throw new Error('transactionId is required');
    }

    if (!sourceAccount) {
      throw new Error('sourceAccount is required');
    }

    if (!targetAccount) {
      throw new Error('targetAccount is required');
    }

    if (sourceAccount === targetAccount) {
      throw new Error('Source and target accounts must be different');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    if (!correlationId) {
      throw new Error('correlationId is required');
    }
  }

  get status(): TransactionStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get interbankState(): InterbankState | null {
    return this._interbankState;
  }

  get isInterbank(): boolean {
    return this.destinationBankCode !== null;
  }

  /** Motivo del fallo o de la compensación; null mientras la Saga no falle. */
  get failureReason(): string | null {
    return this._failureReason;
  }

  markAsProcessing(): void {
    this.ensureStatus(TransactionStatus.PENDING);

    this._status = TransactionStatus.PROCESSING;
    this.touch();
  }

  markAsCompleted(): void {
    this.ensureStatus(TransactionStatus.PROCESSING);

    this._status = TransactionStatus.COMPLETED;
    this.touch();
  }

  markAsFailed(reason?: string): void {
    if (
      this._status !== TransactionStatus.PENDING &&
      this._status !== TransactionStatus.PROCESSING
    ) {
      throw new Error(
        `Transaction cannot fail from status ${this._status}`,
      );
    }

    this._status = TransactionStatus.FAILED;
    this._failureReason = reason ?? this._failureReason;
    this.touch();
  }

  markAsCompensating(reason?: string): void {
    this.ensureStatus(TransactionStatus.PROCESSING);

    this._status = TransactionStatus.COMPENSATING;
    this._failureReason = reason ?? this._failureReason;
    this.touch();
  }

  markAsCompensated(): void {
    this.ensureStatus(TransactionStatus.COMPENSATING);

    this._status = TransactionStatus.COMPENSATED;
    this.touch();
  }

  /**
   * Avance frente al banco pareja (eventos de Account y Payment). Devuelve
   * false si el evento llegó tarde o repetido y no cambió nada.
   * REJECTED antes de enviar (Account no reservó) falla la Saga; después
   * de enviar, la reserva se está liberando (COMPENSATING), igual que REVERSED.
   */
  advanceInterbank(
    state: InterbankState,
    reason?: string,
  ): boolean {
    const current = this._interbankState;

    if (
      isFinalInterbankState(current) ||
      (current !== null &&
        INTERBANK_STAGE[current] >= INTERBANK_STAGE[state])
    ) {
      return false;
    }

    this._interbankState = state;

    switch (state) {
      case InterbankState.SENT:
      case InterbankState.TIMEOUT:
      case InterbankState.ACCEPTED:
        this._status = TransactionStatus.PROCESSING;
        break;
      case InterbankState.REJECTED:
        this._status =
          this._status === TransactionStatus.PENDING
            ? TransactionStatus.FAILED
            : TransactionStatus.COMPENSATING;
        this._failureReason = reason ?? this._failureReason;
        break;
      case InterbankState.REVERSED:
        this._status = TransactionStatus.COMPENSATING;
        this._failureReason = reason ?? this._failureReason;
        break;
    }

    this.touch();
    return true;
  }

  /**
   * Cierre en Account: débito confirmado (COMPLETED) o reserva liberada
   * (COMPENSATED). Si llega antes que el evento de Payment, deja el estado
   * interbancario final que corresponde.
   */
  settleInterbank(
    status:
      | TransactionStatus.COMPLETED
      | TransactionStatus.COMPENSATED,
  ): boolean {
    if (
      this._status === TransactionStatus.COMPLETED ||
      this._status === TransactionStatus.COMPENSATED ||
      this._status === TransactionStatus.FAILED
    ) {
      return false;
    }

    if (!isFinalInterbankState(this._interbankState)) {
      this._interbankState =
        status === TransactionStatus.COMPLETED
          ? InterbankState.ACCEPTED
          : InterbankState.REVERSED;
    }

    this._status = status;
    this.touch();
    return true;
  }

  private ensureStatus(expected: TransactionStatus): void {
    if (this._status !== expected) {
      throw new Error(
        `Expected transaction status ${expected}, current status is ${this._status}`,
      );
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }
}
