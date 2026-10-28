import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { QuotesController } from './quotes.controller';
import { QuotesRepository } from './quotes.repository';
import { QuotesService } from './quotes.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [OutboxModule],
  controllers: [QuotesController, OrdersController],
  providers: [QuotesRepository, QuotesService, OrdersRepository, OrdersService],
  exports: [QuotesService, OrdersService],
})
export class SalesModule {}
