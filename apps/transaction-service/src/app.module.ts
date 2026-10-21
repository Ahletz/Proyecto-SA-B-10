import { Module } from '@nestjs/common';
import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TransactionModule } from './transaction/transaction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService,
      ) => ({
        type: 'postgres',

        host:
          configService.getOrThrow<string>(
            'DB_HOST',
          ),

        port: Number(
          configService.getOrThrow<string>(
            'DB_PORT',
          ),
        ),

        username:
          configService.getOrThrow<string>(
            'DB_USERNAME',
          ),

        password:
          configService.getOrThrow<string>(
            'DB_PASSWORD',
          ),

        database:
          configService.getOrThrow<string>(
            'DB_DATABASE',
          ),

        schema:
          configService.get<string>(
            'DB_SCHEMA',
            'public',
          ),

        autoLoadEntities: true,

        // Pool por réplica: Cloud SQL db-f1-micro admite ~25 conexiones y el HPA
        // llega a 5 réplicas (5 x 4 = 20). Con el default de 10 se agotaban.
        extra: {
          max: Number(
            configService.get<string>('DB_POOL_MAX', '4'),
          ),
        },

        synchronize:
          configService.get<string>(
            'DB_SYNCHRONIZE',
            'false',
          ) === 'true',
      }),
    }),

    TransactionModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],
})
export class AppModule {}
