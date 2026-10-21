import {Body,Controller,Delete,Get,Param,Post} from '@nestjs/common';import {ConfigService} from '@nestjs/config';import {Roles} from '../auth/roles.decorator';import {proxyJson} from './proxy.util';
@Controller('api') export class AdminController{constructor(private readonly c:ConfigService){}
 @Roles('ADMIN') @Get('audit/events') audit(){return proxyJson(this.c.get('NOTIFICATION_SERVICE_URL','http://localhost:8082'),'/api/audit/events','GET');}
 @Roles('ADMIN','CASHIER') @Get('payments') payments(){return proxyJson(this.c.get('PAYMENT_SERVICE_URL','http://localhost:3005'),'/api/payments','GET');}
 // Simulación de fallos de Payment en caliente (escenarios de fallo de la Fase 3), sin redesplegar.
 // Solo ADMIN; el Gateway agrega el X-Admin-Token que Payment exige (Secret bank-interbank-secret).
 // La configuración vive en memoria de cada pod de Payment: con más de una réplica afecta solo al que respondió.
 @Roles('ADMIN') @Get('admin/payment-simulation') simulation(){return this.simulationCall('GET');}
 @Roles('ADMIN') @Post('admin/payment-simulation') setSimulation(@Body()b:Record<string,unknown>){return this.simulationCall('POST',b);}
 @Roles('ADMIN') @Delete('admin/payment-simulation') resetSimulation(){return this.simulationCall('DELETE');}
 private simulationCall(method:string,body?:Record<string,unknown>){const token=this.c.get<string>('PAYMENT_ADMIN_TOKEN');return proxyJson(this.c.get('PAYMENT_SERVICE_URL','http://localhost:3005'),'/internal/payment-simulation',method,body,token?{'X-Admin-Token':token}:{});}
 @Roles('ADMIN','CASHIER') @Get('payments/transaction/:id') payment(@Param('id')id:string){return proxyJson(this.c.get('PAYMENT_SERVICE_URL','http://localhost:3005'),`/api/payments/transaction/${id}`,'GET');}}
