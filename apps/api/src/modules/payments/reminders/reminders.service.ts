import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ReminderCreateInput,
  ReminderListResponse,
  ReminderSummary,
  WhatsappReminderResponse,
} from '@ventascatalogo/contracts';
import type { PaymentReminder } from '@prisma/client';
import { RemindersRepository } from './reminders.repository';
import { buildReminderMessage } from './reminder-message';
import { EmailService } from '../../email/email.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { AppException } from '../../../common/errors/app-exception';
import { AuditService } from '../../audit/audit.service';
import type { AuditMeta } from '../../../common/audit/audit.types';

@Injectable()
export class RemindersService {
  constructor(
    private readonly repo: RemindersRepository,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthenticatedUser,
    orderId: string,
    input: ReminderCreateInput,
    meta: AuditMeta,
  ): Promise<ReminderSummary | WhatsappReminderResponse> {
    const order = await this.repo.findOrder(user.organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });

    const balanceMinor = order.totalMinor - order.paidMinor;
    if (balanceMinor <= 0n) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'order_fully_paid',
        orderId: order.id,
      });
    }

    const link = await this.repo.findActivePaymentLink(order.id);
    const messageInput = {
      customerName: order.customer.name,
      orderNumber: order.number,
      balanceMinor,
      currency: order.currency,
      paymentUrl: link?.url ?? null,
      organizationName: user.organizationName ?? 'VentasCatálogo',
    };
    const message = buildReminderMessage(messageInput);

    const reminder =
      input.channel === 'WHATSAPP'
        ? await this.sendWhatsapp(user, order, order.customer.phone, message.text, meta)
        : await this.sendEmail(user, order, order.customer.email, message, meta);

    return reminder;
  }

  async list(organizationId: string, orderId: string): Promise<ReminderListResponse> {
    const order = await this.repo.findOrder(organizationId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    const reminders = await this.repo.listByOrder(organizationId, order.id);
    return { orderId: order.id, items: reminders.map(toReminderSummary) };
  }

  private async sendEmail(
    user: AuthenticatedUser,
    order: { id: string; catalogId: string },
    to: string | null,
    message: { subject: string; text: string; html: string },
    meta: AuditMeta,
  ): Promise<ReminderSummary> {
    if (!to) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'customer_email_missing',
      });
    }
    const sent = await this.email.send({
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    const reminder = await this.persist(user, order.id, order.catalogId, {
      channel: 'EMAIL',
      to,
      status: sent ? 'SENT' : 'FAILED',
      providerMessageId: null,
      error: sent ? null : 'email_send_failed',
      sentAt: sent ? new Date() : null,
      meta,
    });
    return toReminderSummary(reminder);
  }

  private async sendWhatsapp(
    user: AuthenticatedUser,
    order: { id: string; catalogId: string },
    to: string | null,
    body: string,
    meta: AuditMeta,
  ): Promise<WhatsappReminderResponse> {
    if (!to) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'customer_phone_missing',
      });
    }
    if (!this.whatsapp.isConfigured()) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider: 'WHATSAPP',
        reason: 'whatsapp_not_configured',
      });
    }
    const result = await this.whatsapp.sendText(to, body);
    const reminder = await this.persist(user, order.id, order.catalogId, {
      channel: 'WHATSAPP',
      to,
      status: result.ok ? 'SENT' : 'FAILED',
      providerMessageId: result.messageId,
      error: result.error,
      sentAt: result.ok ? new Date() : null,
      meta,
    });
    return { reminder: toReminderSummary(reminder), waMessageId: result.messageId };
  }

  private async persist(
    user: AuthenticatedUser,
    orderId: string,
    catalogId: string | null,
    data: {
      channel: 'EMAIL' | 'WHATSAPP';
      to: string;
      status: 'SENT' | 'FAILED';
      providerMessageId: string | null;
      error: string | null;
      sentAt: Date | null;
      meta: AuditMeta;
    },
  ): Promise<PaymentReminder> {
    const reminder = await this.repo.create({
      organizationId: user.organizationId,
      catalogId,
      orderId,
      channel: data.channel,
      to: data.to,
      status: data.status,
      providerMessageId: data.providerMessageId,
      error: data.error,
      sentAt: data.sentAt,
      createdByUserId: user.id,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'payment.reminder_sent',
      entityType: 'payment_reminder',
      entityId: reminder.id,
      after: {
        orderId,
        channel: reminder.channel,
        to: reminder.to,
        status: reminder.status,
        error: reminder.error,
      },
      ip: data.meta.ip,
      userAgent: data.meta.userAgent,
      traceId: data.meta.traceId,
    });

    return reminder;
  }
}

export function toReminderSummary(reminder: PaymentReminder): ReminderSummary {
  return {
    id: reminder.id,
    orderId: reminder.orderId,
    channel: reminder.channel,
    to: reminder.to,
    status: reminder.status,
    sentAt: reminder.sentAt?.toISOString() ?? null,
    createdAt: reminder.createdAt.toISOString(),
  };
}
