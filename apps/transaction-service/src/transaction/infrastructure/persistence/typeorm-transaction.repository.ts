import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import {
  TransactionHistoryQuery,
  TransactionPage,
  TransactionRepository,
} from '../../application/ports/transaction.repository';
import { Transaction } from '../../domain/entities/transaction.entity';
import { TransactionOrmEntity } from './transaction.orm-entity';
import { recordSagaState } from '../../../common/telemetry';
import { toPublicStatus } from '../../domain/enums/public-transaction-status.enum';

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

    // Todo cambio de estado de la Saga pasa por aquí: queda como evento del
    // span activo (process <evento>), así la traza muestra PENDING ->
    // PROCESSING -> COMPLETED/FAILED y las compensaciones.
    recordSagaState({
      'bank.transaction.id': transaction.transactionId,
      'bank.transaction.state': transaction.status,
      'bank.transaction.public_state': toPublicStatus(transaction.status),
      'bank.interbank.state': transaction.interbankState,
      'bank.transaction.failure_reason': transaction.failureReason,
    });
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

  async findByAccount(
    query: TransactionHistoryQuery,
  ): Promise<TransactionPage> {
    const qb = this.repository
      .createQueryBuilder('t')
      .where(
        new Brackets((account) => {
          account
            .where('t.sourceAccount = :accountId')
            .orWhere('t.targetAccount = :accountId');
        }),
      )
      .setParameter('accountId', query.accountId);

    if (query.from) {
      qb.andWhere('t.createdAt >= :from', { from: query.from });
    }

    if (query.to) {
      qb.andWhere('t.createdAt <= :to', { to: query.to });
    }

    if (query.statuses?.length) {
      qb.andWhere('t.status IN (:...statuses)', {
        statuses: query.statuses,
      });
    }

    const [entities, total] = await qb
      .orderBy('t.createdAt', 'DESC')
      .addOrderBy('t.transactionId', 'DESC')
      .skip((query.page - 1) * query.size)
      .take(query.size)
      .getManyAndCount();

    return {
      items: entities.map((entity) => this.toDomain(entity)),
      total,
    };
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
    entity.failureReason = transaction.failureReason;
    entity.destinationBankCode = transaction.destinationBankCode;
    entity.interbankState = transaction.interbankState;
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
      entity.failureReason ?? null,
      entity.destinationBankCode ?? null,
      entity.interbankState ?? null,
    );
  }
}
