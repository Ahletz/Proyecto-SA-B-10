import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TransactionRepository } from '../../application/ports/transaction.repository';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionOrmEntity } from './transaction.orm-entity';

@Injectable()
export class TypeOrmTransactionRepository
  extends TransactionRepository
{
  constructor(
    @InjectRepository(TransactionOrmEntity)
    private readonly repository: Repository<TransactionOrmEntity>,
  ) {
    super();
  }

  async save(transaction: Transaction): Promise<void> {
    const entity = this.toPersistence(transaction);

    await this.repository.save(entity);
  }

  async findById(
    transactionId: string,
  ): Promise<Transaction | null> {
    const entity = await this.repository.findOne({
      where: { transactionId },
    });

    return entity ? this.toDomain(entity) : null;
  }

  async findByCorrelationId(
    correlationId: string,
  ): Promise<Transaction | null> {
    const entity = await this.repository.findOne({
      where: { correlationId },
    });

    return entity ? this.toDomain(entity) : null;
  }

  private toPersistence(
    transaction: Transaction,
  ): TransactionOrmEntity {
    const entity = new TransactionOrmEntity();

    entity.transactionId = transaction.transactionId;
    entity.sourceAccount = transaction.sourceAccount;
    entity.targetAccount = transaction.targetAccount;
    entity.amount = transaction.amount.toString();
    entity.status = transaction.status;
    entity.correlationId = transaction.correlationId;
    entity.createdAt = transaction.createdAt;
    entity.updatedAt = transaction.updatedAt;

    return entity;
  }

  private toDomain(
    entity: TransactionOrmEntity,
  ): Transaction {
    return new Transaction(
      entity.transactionId,
      entity.sourceAccount,
      entity.targetAccount,
      Number(entity.amount),
      entity.status,
      entity.correlationId,
      entity.createdAt,
      entity.updatedAt,
    );
  }
}
