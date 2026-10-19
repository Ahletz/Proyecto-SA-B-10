import { Body, Controller, Get, Headers, Logger, Param, Post, Query, Res } from '@nestjs/common';
interface Response { status(code: number): Response; json(body: unknown): unknown; setHeader(name: string, value: string): unknown }
import { InterbankHttpError, InterbankService } from './interbank.service';

// Contrato interbancario del curso (docs/interbank/openapi.yaml), base /interbank/v1.
// El API Gateway valida X-Api-Key, exige traceparent y reenvía el banco que llamó en X-Caller-Bank-Code
// (siempre lo reescribe: nunca se toma de la solicitud original). Este servicio no es público.
@Controller('interbank/v1')
export class InterbankController {
  private readonly logger = new Logger(InterbankController.name);
  constructor(private readonly service: InterbankService) {}

  private async reply(res: Response, fn: () => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>) {
    try {
      const r = await fn();
      res.status(r.status).json(r.body);
    } catch (e) {
      if (e instanceof InterbankHttpError) {
        if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
        res.status(e.status).json({ code: e.code, message: e.message, timestamp: new Date().toISOString() });
        return;
      }
      this.logger.error({ message: 'Error inesperado en el contrato interbancario', event: 'interbank.unexpected_error', error: String(e) });
      res.setHeader('Retry-After', '5');
      res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'Error interno; reintente', timestamp: new Date().toISOString() });
    }
  }

  @Get('health')
  health(@Res() res: Response) { return this.reply(res, () => ({ status: 200, body: this.service.health() })); }

  @Post('transfers')
  receive(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
    return this.reply(res, () => this.service.receiveTransfer(caller, key, body));
  }

  @Get('transfers/:id')
  status(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Param('id') id: string) {
    return this.reply(res, () => this.service.getTransfer(caller, id));
  }

  @Post('transfers/:id/cancel')
  cancel(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return this.reply(res, () => this.service.cancelTransfer(caller, id, body));
  }

  @Post('transfers/:id/result')
  result(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return this.reply(res, () => this.service.receiveResult(caller, id, body));
  }

  @Post('reversals')
  reversal(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Body() body: unknown) {
    return this.reply(res, () => this.service.requestReversal(caller, body));
  }

  @Get('reversals/:id')
  reversalStatus(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Param('id') id: string) {
    return this.reply(res, () => this.service.getReversal(caller, id));
  }

  @Get('reconciliation')
  reconciliation(@Res() res: Response, @Headers('x-caller-bank-code') caller: string | undefined, @Query('date') date?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.reply(res, () => this.service.reconciliation(caller, date, page, pageSize));
  }
}

// Operación interna (no está en el contrato ni se publica en el Gateway): conciliar un día contra el banco pareja a demanda.
@Controller('internal/interbank')
export class InterbankAdminController {
  constructor(private readonly service: InterbankService) {}

  @Post('reconcile')
  reconcile(@Query('date') date: string | undefined) {
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    return this.service.reconcile(day);
  }
}
