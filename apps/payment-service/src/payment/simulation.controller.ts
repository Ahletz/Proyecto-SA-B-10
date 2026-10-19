import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';

// Endpoint INTERNO para los escenarios de falla y las pruebas de carga.
// No debe exponerse por el API Gateway. Si ADMIN_TOKEN está definido, exige el header X-Admin-Token.
@Controller('internal/payment-simulation')
export class SimulationController {
  constructor(private readonly payments: PaymentService) {}

  @Get()
  get(@Headers('x-admin-token') token?: string) {
    this.authorize(token);
    return this.payments.getSimulation();
  }

  @Post()
  set(@Headers('x-admin-token') token: string | undefined, @Body() body: unknown) {
    this.authorize(token);
    const { errors } = this.payments.setSimulation(body);
    if (errors.length) throw new BadRequestException(errors);
    return this.payments.getSimulation();
  }

  @Delete()
  reset(@Headers('x-admin-token') token?: string) {
    this.authorize(token);
    this.payments.resetSimulation();
    return this.payments.getSimulation();
  }

  private authorize(token?: string) {
    const expected = process.env.ADMIN_TOKEN;
    if (expected && token !== expected) throw new ForbiddenException('Token inválido');
  }
}
