import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './account.entity';
import { ReservationEntity } from './reservation.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { RabbitService } from './rabbit.service';
import { AccountConsumer } from './account.consumer';
import { HealthController } from './health.controller';
@Module({ imports:[TypeOrmModule.forFeature([AccountEntity,ReservationEntity,ProcessedEventEntity])], controllers:[AccountController,HealthController], providers:[AccountService,RabbitService,AccountConsumer] })
export class AccountModule {}
