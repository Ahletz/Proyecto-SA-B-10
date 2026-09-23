import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { RabbitService } from './rabbit.service';
import { AccountService } from './account.service';
import { BankEvent } from '../common/bank-event';
@Injectable()
export class AccountConsumer implements OnModuleInit {
  constructor(private readonly rabbit: RabbitService, private readonly service: AccountService) {}
  async onModuleInit() { await this.rabbit.subscribe(['transaction.created','payment.approved','payment.rejected'], m => this.onMessage(m)); }
  private async onMessage(m: ConsumeMessage) { const e = JSON.parse(m.content.toString('utf8')) as BankEvent; if (!e.eventId || !e.eventType || !e.correlationId || !e.payload) throw new Error('Invalid event envelope'); await this.service.handle(e); }
}
