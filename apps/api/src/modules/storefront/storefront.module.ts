import { Module } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { MeOrdersController } from './me-orders.controller';
import { StorefrontRepository } from './storefront.repository';
import { StorefrontService } from './storefront.service';

@Module({
  controllers: [StorefrontController, MeOrdersController],
  providers: [StorefrontRepository, StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
