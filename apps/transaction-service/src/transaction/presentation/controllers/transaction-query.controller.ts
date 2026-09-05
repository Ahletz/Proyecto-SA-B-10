import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { TransactionRepository } from '../../application/ports/transaction.repository';
@Controller('api/transactions')
export class TransactionQueryController {
  constructor(private readonly repository: TransactionRepository) {}
  @Get('correlation/:correlationId')
  async byCorrelation(@Param('correlationId') correlationId: string) {
    const t = await this.repository.findByCorrelationId(correlationId);
    if (!t) throw new NotFoundException('Transaction not found');
    return { transactionId:t.transactionId, sourceAccount:t.sourceAccount, targetAccount:t.targetAccount, amount:t.amount, status:t.status, correlationId:t.correlationId, createdAt:t.createdAt, updatedAt:t.updatedAt };
  }
  @Get(':transactionId')
  async byId(@Param('transactionId') transactionId: string) {
    const t = await this.repository.findById(transactionId);
    if (!t) throw new NotFoundException('Transaction not found');
    return { transactionId:t.transactionId, sourceAccount:t.sourceAccount, targetAccount:t.targetAccount, amount:t.amount, status:t.status, correlationId:t.correlationId, createdAt:t.createdAt, updatedAt:t.updatedAt };
  }
}
