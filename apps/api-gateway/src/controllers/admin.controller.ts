import {Controller,Get,Param} from '@nestjs/common';import {ConfigService} from '@nestjs/config';import {Roles} from '../auth/roles.decorator';import {proxyJson} from './proxy.util';
@Controller('api') export class AdminController{constructor(private readonly c:ConfigService){}
 @Roles('ADMIN') @Get('audit/events') audit(){return proxyJson(this.c.get('NOTIFICATION_SERVICE_URL','http://localhost:8082'),'/api/audit/events','GET');}
 @Roles('ADMIN','CASHIER') @Get('payments') payments(){return proxyJson(this.c.get('PAYMENT_SERVICE_URL','http://localhost:3005'),'/api/payments','GET');}
 @Roles('ADMIN','CASHIER') @Get('payments/transaction/:id') payment(@Param('id')id:string){return proxyJson(this.c.get('PAYMENT_SERVICE_URL','http://localhost:3005'),`/api/payments/transaction/${id}`,'GET');}}
