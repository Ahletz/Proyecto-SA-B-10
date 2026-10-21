import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { CORRELATION_HEADER, currentCorrelationId } from '../correlation/correlation';
// Tiempo máximo de una llamada a un servicio interno. Si el servicio está caído (Service sin pods), la conexión
// no se rechaza: queda colgada hasta el timeout de undici (~10 s) y terminaba en 500. Se corta antes y se responde 503.
const TIMEOUT_MS=Number(process.env.PROXY_TIMEOUT_MS??'5000');
// El X-Correlation-Id del request en curso viaja en toda llamada a los servicios.
export async function proxyJson(base:string,path:string,method:string,body?:any,headers:Record<string,string>={}){const cid=currentCorrelationId();let res:Response;try{res=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json',...(cid?{[CORRELATION_HEADER]:cid}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT_MS)});}catch(e){throw new ServiceUnavailableException(`Upstream service unavailable (${new URL(base).hostname}): ${e instanceof Error?e.name==='TimeoutError'?'timeout':e.message:String(e)}`);}const text=await res.text();let data:any=text;try{data=text?JSON.parse(text):{};}catch{}if(!res.ok)throw new HttpException(data||res.statusText,res.status);return data;}
