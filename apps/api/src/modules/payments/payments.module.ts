import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PublicPaymentsController } from './payments-public.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { PaymentGatewayRegistry } from './payment-gateway';
import { SandboxGateway } from './gateways/sandbox.gateway';
import { StripeGateway } from './gateways/stripe.gateway';

@Module({
  controllers: [PaymentsController, PublicPaymentsController],
  providers: [
    PaymentsRepository,
    PaymentsService,
    PaymentGatewayRegistry,
    SandboxGateway,
    StripeGateway,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
