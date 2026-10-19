import './tracing';
import { JsonLogger } from './common/json-logger';
import { correlationMiddleware } from './common/correlation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap(){ const app=await NestFactory.create(AppModule, { logger: new JsonLogger() }); app.use(correlationMiddleware); app.enableCors(); await app.listen(process.env.PORT ?? 3004); }
bootstrap();
