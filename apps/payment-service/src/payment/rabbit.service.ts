import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type {Channel,ChannelModel,ConsumeMessage} from 'amqplib';
import {BankEvent} from '../common/bank-event';
@Injectable() export class RabbitService implements OnModuleDestroy{
 private readonly logger=new Logger(RabbitService.name); private conn:ChannelModel|null=null; private channel:Channel|null=null;
 constructor(private readonly c:ConfigService){}
 private async ch(){if(this.channel)return this.channel;this.conn=await amqp.connect(this.c.getOrThrow<string>('RABBITMQ_URL'));this.channel=await this.conn.createChannel();for(const e of ['bank.events','bank.events.retry','bank.events.dlx'])await this.channel.assertExchange(e,'topic',{durable:true});return this.channel;}
 async publish<T>(e:BankEvent<T>){const ch=await this.ch();ch.publish('bank.events',e.eventType,Buffer.from(JSON.stringify(e)),{persistent:true,contentType:'application/json',messageId:e.eventId,correlationId:e.correlationId});}
 async subscribe(handler:(m:ConsumeMessage)=>Promise<void>){const ch=await this.ch();const q=this.c.get('RABBITMQ_QUEUE','payment-service.events');const rq=`${q}.retry`;const dq=`${q}.dlq`;const delay=Number(this.c.get('RABBITMQ_RETRY_DELAY_MS',3000));await ch.assertQueue(q,{durable:true});await ch.assertQueue(rq,{durable:true,arguments:{'x-message-ttl':delay,'x-dead-letter-exchange':'bank.events'}});await ch.assertQueue(dq,{durable:true});for(const [qq,ex] of [[q,'bank.events'],[rq,'bank.events.retry'],[dq,'bank.events.dlx']] as const)await ch.bindQueue(qq,ex,'account.funds.reserved');await ch.consume(q,async m=>{if(!m)return;try{await handler(m);ch.ack(m);}catch(e){const h=m.properties.headers??{};const n=Number(h['x-retry-count']??0);const max=Number(this.c.get('RABBITMQ_MAX_RETRIES',3));const ex=n<max?'bank.events.retry':'bank.events.dlx';ch.publish(ex,m.fields.routingKey,m.content,{persistent:true,contentType:'application/json',messageId:m.properties.messageId,correlationId:m.properties.correlationId,headers:{...h,'x-retry-count':n+(n<max?1:0),'x-last-error':e instanceof Error?e.message:String(e)}});ch.ack(m);this.logger[n<max?'warn':'error'](n<max?`retry ${n+1}/${max}`:'moved to DLQ');}},{noAck:false});}
 async onModuleDestroy(){if(this.channel)await this.channel.close();if(this.conn)await this.conn.close();}
}
