import {Controller,Get,Headers,Param,Post,Query,Req,Res} from '@nestjs/common';import {ConfigService} from '@nestjs/config';import {timingSafeEqual} from 'crypto';import {Public} from '../auth/public.decorator';import {CORRELATION_HEADER,currentCorrelationId} from '../correlation/correlation';
// Contrato interbancario del curso (docs/interbank/openapi.yaml) expuesto hacia el banco pareja.
// Solo estas rutas llegan a Payment (nunca /internal/*). Cada banco se autentica con su X-Api-Key
// (Secret gateway-interbank-keys, INTERBANK_API_KEYS={"BANKnn":"clave"}) y el Gateway reescribe
// X-Caller-Bank-Code con el banco dueño de la clave; el valor que manda el cliente se descarta.
interface Res{status(code:number):Res;setHeader(name:string,value:string):unknown;send(body:string):unknown}
const TRACEPARENT=/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const error=(res:Res,status:number,code:string,message:string)=>{res.setHeader('content-type','application/json');res.status(status).send(JSON.stringify({code,message,timestamp:new Date().toISOString()}));};
export function bankForKey(keys:Record<string,string>,apiKey:string|undefined){if(!apiKey)return undefined;const given=Buffer.from(apiKey);for(const [bank,key]of Object.entries(keys)){const k=Buffer.from(key);if(k.length===given.length&&timingSafeEqual(k,given))return bank;}return undefined;}
@Public()@Controller('interbank/v1')export class InterbankController{
 private readonly keys:Record<string,string>;
 constructor(private readonly c:ConfigService){try{this.keys=JSON.parse(c.get('INTERBANK_API_KEYS','{}'));}catch{this.keys={};}}
 @Get('health')health(@Res()res:Res){return this.forward(res,'GET','/health',undefined,{});}
 @Post('transfers')receive(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>){return this.guarded(req,res,h,'POST','/transfers');}
 @Get('transfers/:id')status(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>,@Param('id')id:string){return this.guarded(req,res,h,'GET',`/transfers/${encodeURIComponent(id)}`);}
 @Post('transfers/:id/cancel')cancel(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>,@Param('id')id:string){return this.guarded(req,res,h,'POST',`/transfers/${encodeURIComponent(id)}/cancel`);}
 @Post('transfers/:id/result')result(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>,@Param('id')id:string){return this.guarded(req,res,h,'POST',`/transfers/${encodeURIComponent(id)}/result`);}
 @Post('reversals')reversal(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>){return this.guarded(req,res,h,'POST','/reversals');}
 @Get('reversals/:id')reversalStatus(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>,@Param('id')id:string){return this.guarded(req,res,h,'GET',`/reversals/${encodeURIComponent(id)}`);}
 @Get('reconciliation')reconciliation(@Req()req:any,@Res()res:Res,@Headers()h:Record<string,string>,@Query()q:Record<string,string>){const qs=new URLSearchParams(Object.entries(q).filter(([k])=>['date','page','pageSize'].includes(k))).toString();return this.guarded(req,res,h,'GET',`/reconciliation${qs?`?${qs}`:''}`);}
 private guarded(req:any,res:Res,h:Record<string,string>,method:string,path:string){
  const bank=bankForKey(this.keys,h['x-api-key']);if(!bank)return error(res,401,'UNAUTHORIZED','API key ausente o inválida');
  if(!TRACEPARENT.test(h['traceparent']??''))return error(res,400,'VALIDATION_ERROR','Falta el header traceparent (W3C Trace Context) o es inválido');
  const headers:Record<string,string>={'x-caller-bank-code':bank};
  // Con OpenTelemetry activo el span HTTP ya continúa el traceparent del banco pareja y la instrumentación de undici
  // lo propaga a Payment (agregarlo a mano lo duplicaría: "a, b"). Sin SDK se reenvía tal cual.
  if(process.env.OTEL_SDK_DISABLED==='true'){headers.traceparent=h['traceparent'];if(h['tracestate'])headers.tracestate=h['tracestate'];}
  if(h['idempotency-key'])headers['idempotency-key']=h['idempotency-key'];
  return this.forward(res,method,path,method==='POST'?JSON.stringify(req.body??{}):undefined,headers);}
 private async forward(res:Res,method:string,path:string,body:string|undefined,headers:Record<string,string>){
  const cid=currentCorrelationId();
  try{const r=await fetch(`${this.c.get('PAYMENT_SERVICE_URL','http://localhost:3005')}/interbank/v1${path}`,{method,body,headers:{'content-type':'application/json',...(cid?{[CORRELATION_HEADER]:cid}:{}),...headers}});
   const retry=r.headers.get('retry-after');if(retry)res.setHeader('Retry-After',retry);res.setHeader('content-type',r.headers.get('content-type')??'application/json');res.status(r.status).send(await r.text());}
  catch{res.setHeader('Retry-After','5');error(res,503,'SERVICE_UNAVAILABLE','Banco no disponible; reintente');}}}
