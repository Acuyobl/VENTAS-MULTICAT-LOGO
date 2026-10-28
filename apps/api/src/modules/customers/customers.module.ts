import { Module } from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [CustomersRepository, CustomersService],
  exports: [CustomersRepository, CustomersService],
})
export class CustomersModule {}
