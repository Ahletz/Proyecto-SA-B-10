import { TransactionStatus } from '../enums/transaction-status.enum';

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

  markAsFailed(): void {
    if (
      this._status !== TransactionStatus.PENDING &&
      this._status !== TransactionStatus.PROCESSING
    ) {
      throw new Error(
        `Transaction cannot fail from status ${this._status}`,
      );
    }

    this._status = TransactionStatus.FAILED;
    this.touch();
  }

  markAsCompensating(): void {
    this.ensureStatus(TransactionStatus.PROCESSING);

    this._status = TransactionStatus.COMPENSATING;
    this.touch();
  }

  markAsCompensated(): void {
    this.ensureStatus(TransactionStatus.COMPENSATING);

    this._status = TransactionStatus.COMPENSATED;
    this.touch();
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
