import { BadRequestException, Controller, Param, Post } from '@nestjs/common';
import { InterbankService } from './interbank.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Endpoint INTERNO: solo lo llama Payment (cancelación recibida del banco pareja). No se expone en el API Gateway.
@Controller('internal/interbank')
export class InterbankController {
  constructor(private readonly service: InterbankService) {}

  @Post('deposits/:id/cancel')
  cancel(@Param('id') id: string) {
    if (!UUID.test(id)) throw new BadRequestException('interbankTransferId inválido');
    return this.service.cancelDeposit(id.toLowerCase());
  }
}
