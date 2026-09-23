import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountModule } from './account/account.module';
@Module({ imports:[ConfigModule.forRoot({isGlobal:true}), ScheduleModule.forRoot(), TypeOrmModule.forRootAsync({inject:[ConfigService],useFactory:(c:ConfigService)=>({type:'postgres',host:c.getOrThrow('DB_HOST'),port:Number(c.getOrThrow('DB_PORT')),username:c.getOrThrow('DB_USERNAME'),password:c.getOrThrow('DB_PASSWORD'),database:c.getOrThrow('DB_DATABASE'),autoLoadEntities:true,synchronize:c.get('DB_SYNCHRONIZE','true')==='true'})}), AccountModule] })
export class AppModule {}
