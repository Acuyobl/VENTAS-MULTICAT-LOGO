import { Injectable } from '@nestjs/common';
import type { PaymentGatewayConfig, PaymentProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GatewaysRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string): Promise<PaymentGatewayConfig[]> {
    return this.prisma.paymentGatewayConfig.findMany({
      where: { organizationId },
      orderBy: { provider: 'asc' },
    });
  }

  find(organizationId: string, provider: PaymentProvider): Promise<PaymentGatewayConfig | null> {
    return this.prisma.paymentGatewayConfig.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
  }

  upsert(input: {
    organizationId: string;
    provider: PaymentProvider;
    mode: string;
    enabled: boolean;
    publicKey: string | null;
    secretEnc: string | null;
    webhookSecretEnc: string | null;
    maskedKey: string | null;
  }): Promise<PaymentGatewayConfig> {
    return this.prisma.paymentGatewayConfig.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: input.provider,
        },
      },
      create: input,
      update: {
        mode: input.mode,
        enabled: input.enabled,
        publicKey: input.publicKey,
        secretEnc: input.secretEnc,
        webhookSecretEnc: input.webhookSecretEnc,
        maskedKey: input.maskedKey,
      },
    });
  }

  setEnabled(id: string, enabled: boolean): Promise<PaymentGatewayConfig> {
    return this.prisma.paymentGatewayConfig.update({
      where: { id },
      data: { enabled },
    });
  }
}
