import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import type { Audience } from '@ventascatalogo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from './session.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { addDuration } from '../../common/utils/duration';
import type { AuthMeta } from './auth.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async request(email: string, audience: Audience): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      this.logger.debug({ email: normalized }, 'password_reset_ignored');
      return;
    }

    const raw = randomToken();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        email: normalized,
        type: 'PASSWORD_RESET',
        tokenHash: sha256(raw),
        expiresAt: addDuration(new Date(), '30m'),
        metadata: { audience },
      },
    });

    const baseUrl =
      audience === 'staff'
        ? this.config.get<string>('STAFF_PUBLIC_URL', 'http://app.localhost:3000')
        : this.config.get<string>('TIENDA_PUBLIC_URL', 'http://tienda.localhost:3000');
    const path = audience === 'staff' ? '/recuperar' : '/mi-cuenta/recuperar';
    await this.email.sendPasswordReset({
      to: normalized,
      link: `${baseUrl}${path}?token=${encodeURIComponent(raw)}`,
    });
  }

  async reset(rawToken: string, password: string, meta: AuthMeta): Promise<{ email: string }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (
      !record ||
      record.type !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      !record.userId
    ) {
      throw new AppException('AUTH_INVITATION_EXPIRED', 401, { reason: 'reset_token_invalid' });
    }

    const passwordHash = await hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.sessions.revokeAllForUser(record.userId);
    await this.audit.write({
      action: 'auth.password.reset',
      entityType: 'user',
      entityId: record.userId,
      actorUserId: record.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return { email: record.email };
  }
}
