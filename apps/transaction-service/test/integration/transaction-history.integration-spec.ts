import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { TransactionRepository } from '../../src/transaction/application/ports/transaction.repository';
import { Transaction } from '../../src/transaction/domain/entities/transaction.entity';
import { TransactionStatus } from '../../src/transaction/domain/enums/transaction-status.enum';
import { TransactionOrmEntity } from '../../src/transaction/infrastructure/persistence/transaction.orm-entity';
import { TypeOrmTransactionRepository } from '../../src/transaction/infrastructure/persistence/typeorm-transaction.repository';

// Solo levanta la capa de persistencia (sin RabbitMQ) contra la PostgreSQL de DB_*.
describe('TypeOrmTransactionRepository.findByAccount - PostgreSQL integration', () => {
  let moduleRef: TestingModule;
  let repository: TransactionRepository;

  const account = `ACC-${randomUUID()}`;
  const other = `ACC-${randomUUID()}`;

  function tx(
    source: string,
    target: string,
    status: TransactionStatus,
    createdAt: string,
  ): Transaction {
    const date = new Date(createdAt);
    return new Transaction(randomUUID(), source, target, 10, status, randomUUID(), date, date);
  }

  const outgoingCompleted = tx(account, other, TransactionStatus.COMPLETED, '2026-09-01T10:00:00Z');
  const incomingCompensated = tx(other, account, TransactionStatus.COMPENSATED, '2026-09-02T10:00:00Z');
  const outgoingProcessing = tx(account, other, TransactionStatus.PROCESSING, '2026-09-03T10:00:00Z');
  const unrelated = tx(other, `ACC-${randomUUID()}`, TransactionStatus.COMPLETED, '2026-09-04T10:00:00Z');

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 5434),
          username: process.env.DB_USERNAME ?? 'transaction_user',
          password: process.env.DB_PASSWORD ?? 'transaction_password',
          database: process.env.DB_DATABASE ?? 'bank_transaction',
          entities: [TransactionOrmEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([TransactionOrmEntity]),
      ],
      providers: [{ provide: TransactionRepository, useClass: TypeOrmTransactionRepository }],
    }).compile();

    repository = moduleRef.get(TransactionRepository);

    for (const t of [outgoingCompleted, incomingCompensated, outgoingProcessing, unrelated]) {
      await repository.save(t);
    }
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef
        .get(DataSource)
        .getRepository(TransactionOrmEntity)
        .delete([outgoingCompleted, incomingCompensated, outgoingProcessing, unrelated].map((t) => t.transactionId));
      await moduleRef.close();
    }
  });

  it('devuelve las transacciones de origen y destino, más recientes primero', async () => {
    const page = await repository.findByAccount({ accountId: account, page: 1, size: 20 });

    expect(page.total).toBe(3);
    expect(page.items.map((t) => t.transactionId)).toEqual([
      outgoingProcessing.transactionId,
      incomingCompensated.transactionId,
      outgoingCompleted.transactionId,
    ]);
  });

  it('filtra por rango de fechas inclusivo', async () => {
    const page = await repository.findByAccount({
      accountId: account,
      from: new Date('2026-09-02T00:00:00Z'),
      to: new Date('2026-09-03T10:00:00Z'),
      page: 1,
      size: 20,
    });

    expect(page.items.map((t) => t.transactionId)).toEqual([
      outgoingProcessing.transactionId,
      incomingCompensated.transactionId,
    ]);
  });

  it('filtra por estados internos', async () => {
    const page = await repository.findByAccount({
      accountId: account,
      statuses: [TransactionStatus.FAILED, TransactionStatus.COMPENSATED],
      page: 1,
      size: 20,
    });

    expect(page.total).toBe(1);
    expect(page.items[0].transactionId).toBe(incomingCompensated.transactionId);
  });

  it('pagina conservando el total', async () => {
    const page = await repository.findByAccount({ accountId: account, page: 2, size: 2 });

    expect(page.total).toBe(3);
    expect(page.items.map((t) => t.transactionId)).toEqual([outgoingCompleted.transactionId]);
  });
});
