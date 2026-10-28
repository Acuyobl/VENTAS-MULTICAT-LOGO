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
import { OrderRemindersController } from './reminders/reminders.controller';
import { RemindersRepository } from './reminders/reminders.repository';
import { RemindersService } from './reminders/reminders.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [
    PaymentsController,
    PublicPaymentsController,
    PaymentRefundsController,
    RefundsController,
    OrderRefundsController,
    OrderRemindersController,
  ],
  providers: [
    PaymentsRepository,
    PaymentsService,
    PaymentGatewayRegistry,
    SandboxGateway,
    StripeGateway,
    RefundsRepository,
    RefundsService,
    RemindersRepository,
    RemindersService,
  ],
  exports: [PaymentsService, RefundsService, RemindersService],
})
export class PaymentsModule {}
