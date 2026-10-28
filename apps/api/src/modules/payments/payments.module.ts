import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PublicPaymentsController } from './payments-public.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { PaymentGatewayRegistry } from './payment-gateway';
import { SandboxGateway } from './gateways/sandbox.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import {
  OrderRefundsController,
  PaymentRefundsController,
  RefundsController,
} from './refunds/refunds.controller';
import { RefundsRepository } from './refunds/refunds.repository';
import { RefundsService } from './refunds/refunds.service';

@Module({
  controllers: [
    PaymentsController,
    PublicPaymentsController,
    PaymentRefundsController,
    RefundsController,
    OrderRefundsController,
  ],
  providers: [
    PaymentsRepository,
    PaymentsService,
    PaymentGatewayRegistry,
    SandboxGateway,
    StripeGateway,
    RefundsRepository,
    RefundsService,
  ],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
