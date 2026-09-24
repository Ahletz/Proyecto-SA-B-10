import { HttpException } from '@nestjs/common';
import { CORRELATION_HEADER, currentCorrelationId } from '../correlation/correlation';
// El X-Correlation-Id del request en curso viaja en toda llamada a los servicios.
export async function proxyJson(base:string,path:string,method:string,body?:any,headers:Record<string,string>={}){const cid=currentCorrelationId();const res=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json',...(cid?{[CORRELATION_HEADER]:cid}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const text=await res.text();let data:any=text;try{data=text?JSON.parse(text):{};}catch{}if(!res.ok)throw new HttpException(data||res.statusText,res.status);return data;}
