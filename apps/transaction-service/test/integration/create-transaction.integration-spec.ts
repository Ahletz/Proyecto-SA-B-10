import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { CreateTransactionService } from '../../src/transaction/application/services/create-transaction.service';
import { TransactionRepository } from '../../src/transaction/application/ports/transaction.repository';
import { TransactionStatus } from '../../src/transaction/domain/enums/transaction-status.enum';

describe('CreateTransactionService - PostgreSQL integration', () => {
  let moduleRef: TestingModule;
  let createTransactionService: CreateTransactionService;
  let transactionRepository: TransactionRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    createTransactionService = moduleRef.get(
      CreateTransactionService,
    );

    transactionRepository = moduleRef.get(
      TransactionRepository,
    );
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should persist a transaction in PostgreSQL', async () => {
    const correlationId = randomUUID();

    const transaction =
      await createTransactionService.execute({
        sourceAccount: 'ACC-001',
        targetAccount: 'ACC-002',
        amount: 500,
        correlationId,
      });

    expect(transaction.transactionId).toBeDefined();
    expect(transaction.correlationId).toBe(correlationId);
    expect(transaction.status).toBe(
      TransactionStatus.PENDING,
    );

    const persisted =
      await transactionRepository.findById(
        transaction.transactionId,
      );

    expect(persisted).not.toBeNull();

    expect(persisted?.transactionId).toBe(
      transaction.transactionId,
    );

    expect(persisted?.sourceAccount).toBe('ACC-001');
    expect(persisted?.targetAccount).toBe('ACC-002');
    expect(persisted?.amount).toBe(500);

    expect(persisted?.status).toBe(
      TransactionStatus.PENDING,
    );
  });

  it('should not create another transaction for the same correlationId', async () => {
    const correlationId = randomUUID();

    const first =
      await createTransactionService.execute({
        sourceAccount: 'ACC-100',
        targetAccount: 'ACC-200',
        amount: 250,
        correlationId,
      });

    const second =
      await createTransactionService.execute({
        sourceAccount: 'ACC-100',
        targetAccount: 'ACC-200',
        amount: 250,
        correlationId,
      });

    expect(second.transactionId).toBe(
      first.transactionId,
    );
  });
});
