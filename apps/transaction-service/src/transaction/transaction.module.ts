import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateTransactionService } from './application/services/create-transaction.service';
import { UpdateTransactionStateService } from './application/services/update-transaction-state.service';
import { GetTransactionHistoryService } from './application/services/get-transaction-history.service';
import { CustomerKycService } from './application/services/customer-kyc.service';
import { TransactionRepository } from './application/ports/transaction.repository';
import { CustomerKycRepository } from './application/ports/customer-kyc.repository';

import { TransactionOrmEntity } from './infrastructure/persistence/transaction.orm-entity';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';
import { CustomerKycStatusOrmEntity } from './infrastructure/persistence/customer-kyc-status.orm-entity';
import { TypeOrmCustomerKycRepository } from './infrastructure/persistence/typeorm-customer-kyc.repository';

import { RabbitMqService } from './infrastructure/messaging/rabbitmq.service';
import { TransactionEventPublisher } from './infrastructure/messaging/transaction-event.publisher';
import { EventIdempotencyService } from './infrastructure/messaging/event-idempotency.service';
import { ProcessedEventOrmEntity } from './infrastructure/messaging/processed-event.orm-entity';

import { TransactionEventsConsumer } from './presentation/consumers/transaction-events.consumer';
import { TransactionQueryController } from './presentation/controllers/transaction-query.controller';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionOrmEntity,
      ProcessedEventOrmEntity,
      CustomerKycStatusOrmEntity,
    ]),
  ],

  controllers: [TransactionQueryController],

  providers: [
    CreateTransactionService,
    UpdateTransactionStateService,
    GetTransactionHistoryService,
    CustomerKycService,

    RabbitMqService,
    TransactionEventPublisher,
    EventIdempotencyService,
    TransactionEventsConsumer,

    {
      provide: TransactionRepository,
      useClass:
        TypeOrmTransactionRepository,
    },

    {
      provide: CustomerKycRepository,
      useClass:
        TypeOrmCustomerKycRepository,
    },
  ],

  exports: [
    CreateTransactionService,
    UpdateTransactionStateService,
    TransactionRepository,
    RabbitMqService,
    TransactionEventPublisher,
    EventIdempotencyService,
  ],
})
export class TransactionModule {}
