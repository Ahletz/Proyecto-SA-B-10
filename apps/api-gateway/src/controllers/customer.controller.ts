import {Body,Controller,Get,Headers,Param,Post,Put,Req} from '@nestjs/common';import {ConfigService} from '@nestjs/config';import {Public} from '../auth/public.decorator';import {proxyJson} from './proxy.util';
@Controller('api/customers') export class CustomerController{constructor(private readonly c:ConfigService){}private base(){return this.c.get('CUSTOMER_SERVICE_URL','http://localhost:8081');}
 @Public() @Post('register') register(@Body()b:any,@Headers('x-correlation-id')cid?:string){return proxyJson(this.base(),'/api/customers/register','POST',b,cid?{'X-Correlation-Id':cid}:{});}
 @Public() @Post('login') login(@Body()b:any){return proxyJson(this.base(),'/api/customers/login','POST',b);}
 @Public() @Get('activate/:token') activate(@Param('token')t:string,@Headers('x-correlation-id')cid?:string){return proxyJson(this.base(),`/api/customers/activate/${t}`,'GET',undefined,cid?{'X-Correlation-Id':cid}:{});}
 @Get('me') me(@Headers('authorization')a:string){return proxyJson(this.base(),'/api/customers/me','GET',undefined,{Authorization:a});}
 @Put('me') update(@Body()b:any,@Headers('authorization')a:string,@Headers('x-correlation-id')cid?:string){return proxyJson(this.base(),'/api/customers/me','PUT',b,{Authorization:a,...(cid?{'X-Correlation-Id':cid}:{})});}}
