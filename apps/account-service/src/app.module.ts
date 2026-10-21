import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountModule } from './account/account.module';
@Module({ imports:[ConfigModule.forRoot({isGlobal:true}), ScheduleModule.forRoot(), TypeOrmModule.forRootAsync({inject:[ConfigService],useFactory:(c:ConfigService)=>({type:'postgres',host:c.getOrThrow('DB_HOST'),port:Number(c.getOrThrow('DB_PORT')),username:c.getOrThrow('DB_USERNAME'),password:c.getOrThrow('DB_PASSWORD'),database:c.getOrThrow('DB_DATABASE'),autoLoadEntities:true,/* pool por réplica: db-f1-micro admite ~25 conexiones y el HPA llega a 5 réplicas (5 x 4 = 20) */extra:{max:Number(c.get('DB_POOL_MAX','4'))},synchronize:c.get('DB_SYNCHRONIZE','true')==='true'})}), AccountModule] })
export class AppModule {}
