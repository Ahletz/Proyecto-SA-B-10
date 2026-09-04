import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreateTransactionService } from './application/services/create-transaction.service';
import { UpdateTransactionStateService } from './application/services/update-transaction-state.service';
import { TransactionRepository } from './application/ports/transaction.repository';

import { TransactionOrmEntity } from './infrastructure/persistence/transaction.orm-entity';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';

import { RabbitMqService } from './infrastructure/messaging/rabbitmq.service';
import { TransactionEventPublisher } from './infrastructure/messaging/transaction-event.publisher';
import { EventIdempotencyService } from './infrastructure/messaging/event-idempotency.service';
import { ProcessedEventOrmEntity } from './infrastructure/messaging/processed-event.orm-entity';

import { TransactionEventsConsumer } from './presentation/consumers/transaction-events.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionOrmEntity,
      ProcessedEventOrmEntity,
    ]),
  ],

  providers: [
    CreateTransactionService,
    UpdateTransactionStateService,

    RabbitMqService,
    TransactionEventPublisher,
    EventIdempotencyService,
    TransactionEventsConsumer,

    {
      provide: TransactionRepository,
      useClass:
        TypeOrmTransactionRepository,
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
