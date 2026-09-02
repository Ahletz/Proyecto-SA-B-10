import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateTransactionService } from './application/services/create-transaction.service';
import { TransactionRepository } from './application/ports/transaction.repository';
import { TransactionOrmEntity } from './infrastructure/persistence/transaction.orm-entity';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionOrmEntity,
    ]),
  ],
  providers: [
    CreateTransactionService,
    {
      provide: TransactionRepository,
      useClass: TypeOrmTransactionRepository,
    },
  ],
  exports: [
    CreateTransactionService,
    TransactionRepository,
  ],
})
export class TransactionModule {}
