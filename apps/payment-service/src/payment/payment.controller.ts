import {Controller,Get,Param} from '@nestjs/common';import {PaymentService} from './payment.service';
@Controller('api/payments') export class PaymentController{constructor(private readonly s:PaymentService){}@Get()list(){return this.s.list();}@Get('transaction/:id')get(@Param('id')id:string){return this.s.getByTransaction(id);}}
