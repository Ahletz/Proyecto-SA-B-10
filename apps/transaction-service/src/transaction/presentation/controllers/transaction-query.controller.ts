import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { TransactionRepository } from '../../application/ports/transaction.repository';
import { GetTransactionHistoryService, InvalidHistoryQueryError } from '../../application/services/get-transaction-history.service';
import { isPublicTransactionStatus } from '../../domain/enums/public-transaction-status.enum';

interface HistoryQueryParams { accountId?: string; from?: string; to?: string; status?: string; page?: string; size?: string; }

@Controller('api/transactions')
export class TransactionQueryController {
  constructor(private readonly repository: TransactionRepository, private readonly history: GetTransactionHistoryService) {}
  @Get()
  async byAccount(@Query() q: HistoryQueryParams) {
    const status = q.status ? q.status.toUpperCase() : undefined;
    if (status !== undefined && !isPublicTransactionStatus(status)) throw new BadRequestException('status must be one of PENDING, APPROVED, FAILED');
    try {
      return await this.history.execute({ accountId: q.accountId ?? '', from: parseDate('from', q.from), to: parseDate('to', q.to), status, page: parseIntParam('page', q.page, 1), size: parseIntParam('size', q.size, 20) });
    } catch (e) {
      if (e instanceof InvalidHistoryQueryError) throw new BadRequestException(e.message);
      throw e;
    }
  }
  @Get('correlation/:correlationId')
  async byCorrelation(@Param('correlationId') correlationId: string) {
    const t = await this.repository.findByCorrelationId(correlationId);
    if (!t) throw new NotFoundException('Transaction not found');
    return { transactionId:t.transactionId, sourceAccount:t.sourceAccount, targetAccount:t.targetAccount, amount:t.amount, status:t.status, failureReason:t.failureReason, correlationId:t.correlationId, createdAt:t.createdAt, updatedAt:t.updatedAt };
  }
  @Get(':transactionId')
  async byId(@Param('transactionId') transactionId: string) {
    const t = await this.repository.findById(transactionId);
    if (!t) throw new NotFoundException('Transaction not found');
    return { transactionId:t.transactionId, sourceAccount:t.sourceAccount, targetAccount:t.targetAccount, amount:t.amount, status:t.status, failureReason:t.failureReason, correlationId:t.correlationId, createdAt:t.createdAt, updatedAt:t.updatedAt };
  }
}

function parseDate(name: string, value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${name} must be an ISO-8601 date`);
  return date;
}

function parseIntParam(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new BadRequestException(`${name} must be a positive integer`);
  return Number(value);
}
