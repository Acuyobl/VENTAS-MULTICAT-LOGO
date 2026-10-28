import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Audience, AuthenticatedUser } from '@ventascatalogo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionService, type IssuedTokens } from './session.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { addDuration, durationToMs } from '../../common/utils/duration';
import type { AuthMeta } from './auth.service';

export interface MagicLinkResult {
  user: AuthenticatedUser;
  tokens: IssuedTokens;
  audience: Audience;
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async request(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      this.logger.debug({ email: normalized }, 'magic_link_ignored');
      return;
    }
    const account = await this.prisma.customerAccount.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      this.logger.debug({ email: normalized }, 'magic_link_without_customer_account');
      return;
    }

    const raw = randomToken();
    const ttl = this.config.get<string>('MAGIC_LINK_TTL', '20m');
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        email: normalized,
        type: 'MAGIC_LINK',
        tokenHash: sha256(raw),
        expiresAt: addDuration(new Date(), ttl),
        metadata: { organizationId: account.organizationId },
      },
    });

    const baseUrl = this.config.get<string>('TIENDA_PUBLIC_URL', 'http://tienda.localhost:3000');
    const link = `${baseUrl}/mi-cuenta/entrar?token=${encodeURIComponent(raw)}`;
    await this.email.sendMagicLink({
      to: normalized,
      link,
      ttlMinutes: Math.round(durationToMs(ttl) / 60_000),
    });
  }

  async consume(rawToken: string, meta: AuthMeta): Promise<MagicLinkResult> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (
      !record ||
      record.type !== 'MAGIC_LINK' ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new AppException('AUTH_INVITATION_EXPIRED', 401, { reason: 'magic_link_invalid' });
    }

    const metadata = (record.metadata ?? {}) as { organizationId?: string };
    if (!metadata.organizationId || !record.userId) {
      throw new AppException('AUTH_INVITATION_EXPIRED', 401, { reason: 'magic_link_incomplete' });
    }

    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    const user = await this.users.buildContext(
      record.userId,
      metadata.organizationId,
      'customer',
    );
    const tokens = await this.sessions.issue(user, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.write({
      action: 'auth.magic_link.login',
      entityType: 'user',
      entityId: user.id,
      organizationId: user.organizationId,
      actorUserId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return { user, tokens, audience: 'customer' };
  }
}
