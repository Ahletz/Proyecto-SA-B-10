import {Body,Controller,Get,Headers,Param,Patch,Post,Put} from '@nestjs/common';import {ConfigService} from '@nestjs/config';import {Public} from '../auth/public.decorator';import {Roles} from '../auth/roles.decorator';import {proxyJson} from './proxy.util';
@Controller('api/customers') export class CustomerController{constructor(private readonly c:ConfigService){}private base(){return this.c.get('CUSTOMER_SERVICE_URL','http://localhost:8081');}
 @Public() @Post('register') register(@Body()b:any){return proxyJson(this.base(),'/api/customers/register','POST',b);}
 @Public() @Post('login') login(@Body()b:any){return proxyJson(this.base(),'/api/customers/login','POST',b);}
 @Public() @Get('activate/:token') activate(@Param('token')t:string){return proxyJson(this.base(),`/api/customers/activate/${t}`,'GET');}
 @Get('me') me(@Headers('authorization')a:string){return proxyJson(this.base(),'/api/customers/me','GET',undefined,{Authorization:a});}
 @Put('me') update(@Body()b:any,@Headers('authorization')a:string){return proxyJson(this.base(),'/api/customers/me','PUT',b,{Authorization:a});}
 @Roles('ADMIN') @Patch(':customerId/kyc') kyc(@Param('customerId')id:string,@Body()b:{status:string},@Headers('authorization')a:string){return proxyJson(this.base(),`/api/customers/${encodeURIComponent(id)}/kyc`,'PATCH',{status:b?.status},{Authorization:a});}}
