import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountType } from './account.entity';
@Controller('api/accounts')
export class AccountController {
  constructor(private readonly service: AccountService) {}
  @Post() create(@Body() b: {customerId:string; type:AccountType; initialBalance?:number}) { return this.service.create(b.customerId,b.type,b.initialBalance ?? 0); }
  @Get() list(@Query('customerId') customerId:string) { return this.service.list(customerId); }
  @Get(':id') get(@Param('id') id:string) { return this.service.get(id); }
  @Post('maintenance/deactivate-inactive') deactivate() { return this.service.deactivateInactive().then(count => ({count})); }
}
