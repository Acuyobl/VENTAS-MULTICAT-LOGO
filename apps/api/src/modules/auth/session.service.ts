import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Audience, AuthenticatedUser, TokenPair } from '@ventascatalogo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { sha256, randomToken } from '../../common/utils/crypto';
import { addDuration } from '../../common/utils/duration';
import { TokenService } from './token.service';
import { UsersService } from '../users/users.service';

export interface SessionMeta {
  deviceName?: string;
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens extends TokenPair {
  accessTokenExpiresAt: string;
  sessionId: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  async issue(
    user: AuthenticatedUser,
    meta: SessionMeta = {},
    familyId?: string,
  ): Promise<IssuedTokens> {
    const access = await this.tokens.signAccessToken(user);
    const refreshToken = randomToken();
    const refreshTtl = this.refreshTtl(user.audience);
    const refreshExpiresAt = addDuration(new Date(), refreshTtl);

    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        audience: user.audience === 'staff' ? 'STAFF' : 'CUSTOMER',
        tokenHash: sha256(refreshToken),
        familyId: familyId ?? randomUUID(),
        deviceName: meta.deviceName ?? null,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken: access.accessToken,
      refreshToken,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      sessionId: session.id,
    };
  }

  async rotate(
    rawRefreshToken: string,
    audience: Audience,
    meta: SessionMeta = {},
  ): Promise<{ user: AuthenticatedUser; tokens: IssuedTokens }> {
    const tokenHash = sha256(rawRefreshToken);
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash } });
    if (!session || session.audience !== audience.toUpperCase()) {
      throw new AppException('UNAUTHORIZED', 401, { reason: 'refresh_not_found' });
    }

    if (session.revokedAt) {
      await this.prisma.authSession.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
      throw new AppException('AUTH_SESSION_REVOKED', 401);
    }
    if (session.expiresAt < new Date()) {
      throw new AppException('AUTH_SESSION_EXPIRED', 401);
    }

    const user = await this.users.buildContext(
      session.userId,
      session.organizationId,
      audience,
    );

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const tokens = await this.issue(
      user,
      {
        deviceName: meta.deviceName ?? session.deviceName ?? undefined,
        ip: meta.ip ?? session.ip ?? undefined,
        userAgent: meta.userAgent ?? session.userAgent ?? undefined,
      },
      session.familyId,
    );
    return { user, tokens };
  }

  async revokeByRefreshToken(rawRefreshToken: string, audience: Audience): Promise<void> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: sha256(rawRefreshToken) },
    });
    if (!session || session.audience !== audience.toUpperCase()) return;
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  async listForUser(userId: string): Promise<
    Array<{
      id: string;
      audience: string;
      organizationId: string;
      deviceName: string | null;
      ip: string | null;
      userAgent: string | null;
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string;
      current: boolean;
    }>
  > {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      audience: session.audience,
      organizationId: session.organizationId,
      deviceName: session.deviceName,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      current: false,
    }));
  }

  async revoke(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new AppException('NOT_FOUND', 404);
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  refreshTtl(audience: Audience): string {
    return audience === 'staff'
      ? this.config.get<string>('STAFF_REFRESH_TTL', '7d')
      : this.config.get<string>('CUSTOMER_REFRESH_TTL', '30d');
  }
}
