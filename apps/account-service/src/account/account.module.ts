import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './account.entity';
import { ReservationEntity } from './reservation.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { InterbankOperationEntity } from './interbank-operation.entity';
import { AccountService } from './account.service';
import { InterbankService } from './interbank.service';
import { AccountController } from './account.controller';
import { InterbankController } from './interbank.controller';
import { RabbitService } from './rabbit.service';
import { AccountConsumer } from './account.consumer';
import { HealthController } from './health.controller';
@Module({ imports:[TypeOrmModule.forFeature([AccountEntity,ReservationEntity,ProcessedEventEntity,InterbankOperationEntity])], controllers:[AccountController,InterbankController,HealthController], providers:[AccountService,InterbankService,RabbitService,AccountConsumer] })
export class AccountModule {}
