import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { RabbitService } from './rabbit.service';
import { AccountService } from './account.service';
import { InterbankService } from './interbank.service';
import { BankEvent } from '../common/bank-event';

const INTERBANK_EVENTS = [
  'interbank.transfer.requested',
  'interbank.transfer.accepted',
  'interbank.transfer.rejected',
  'interbank.transfer.reversed',
  'interbank.deposit.requested',
  'interbank.reversal.requested',
];

@Injectable()
export class AccountConsumer implements OnModuleInit {
  constructor(private readonly rabbit: RabbitService, private readonly service: AccountService, private readonly interbank: InterbankService) {}
  async onModuleInit() { await this.rabbit.subscribe(['transaction.created','payment.approved','payment.rejected', ...INTERBANK_EVENTS], m => this.onMessage(m)); }
  private async onMessage(m: ConsumeMessage) {
    const e = JSON.parse(m.content.toString('utf8')) as BankEvent;
    if (!e.eventId || !e.eventType || !e.correlationId || !e.payload) throw new Error('Invalid event envelope');
    if (INTERBANK_EVENTS.includes(e.eventType)) await this.interbank.handle(e);
    else await this.service.handle(e);
  }
}
