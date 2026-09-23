import {Controller,Get} from '@nestjs/common';@Controller()export class HealthController{@Get('health')health(){return{service:'payment-service',status:'UP',timestamp:new Date().toISOString()};}}
