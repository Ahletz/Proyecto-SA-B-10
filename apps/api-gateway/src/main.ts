import './tracing';
import {JsonLogger} from './common/json-logger';
import {NestFactory} from '@nestjs/core';import {AppModule} from './app.module';import {CORRELATION_HEADER,correlationMiddleware} from './correlation/correlation';async function bootstrap(){const app=await NestFactory.create(AppModule,{logger:new JsonLogger()});app.use(correlationMiddleware);app.enableCors({origin:true,credentials:true,exposedHeaders:[CORRELATION_HEADER]});await app.listen(process.env.PORT??8080);}bootstrap();
