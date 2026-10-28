import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from 'argon2';
import type {
  Audience,
  AuthenticatedUser,
  LoginInput,
  LoginResponse,
} from '@ventascatalogo/contracts';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionService, type IssuedTokens } from './session.service';
import { TokenService } from './token.service';
import { MfaService } from './mfa.service';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';
import type { User } from '@prisma/client';

export interface AuthMeta extends AuditMeta {
  ip?: string;
  userAgent?: string;
  traceId: string;
}

export interface AuthResult {
  response: LoginResponse;
  tokens?: IssuedTokens;
  audience?: Audience;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: AuthMeta): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.passwordHash) {
      throw new AppException('UNAUTHORIZED', 401, { reason: 'invalid_credentials' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException('RATE_LIMITED', 429, {
        reason: 'login_locked',
        until: user.lockedUntil.toISOString(),
      });
    }

    const validPassword = await verify(user.passwordHash, input.password).catch(() => false);
    if (!validPassword) {
      await this.registerFailedLogin(user);
      throw new AppException('UNAUTHORIZED', 401, { reason: 'invalid_credentials' });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const organizationId = await this.users.findOrganizationForAudience(user.id, input.audience);
    if (!organizationId) {
      throw new AppException('FORBIDDEN', 403, { reason: 'no_account_for_audience' });
    }

    const userContext = await this.users.buildContext(user.id, organizationId, input.audience);
    const enforceMfa = this.config.get<boolean>('MFA_ENFORCE_ADMINS', true);
    const isAdmin =
      userContext.roleKeys.includes('org_admin') || userContext.roleKeys.includes('superadmin');

    if (input.audience === 'staff' && enforceMfa && isAdmin) {
      if (!user.mfaEnabled) {
        return {
          response: {
            status: 'mfa_enrollment_required',
            mfaToken: await this.tokens.signMfaToken({
              sub: user.id,
              org: organizationId,
              targetAudience: 'staff',
              purpose: 'mfa:enroll',
            }),
          },
        };
      }
      if (!input.mfaCode) {
        return {
          response: {
            status: 'mfa_required',
            mfaToken: await this.tokens.signMfaToken({
              sub: user.id,
              org: organizationId,
              targetAudience: 'staff',
              purpose: 'mfa:login',
            }),
          },
        };
      }
      if (!this.mfa.verify(input.mfaCode, user.mfaSecretEnc)) {
        await this.registerFailedLogin(user);
        throw new AppException('AUTH_MFA_INVALID', 401);
      }
    }

    return this.completeLogin(userContext, input.deviceName, meta);
  }

  async refresh(
    rawRefreshToken: string,
    audience: Audience,
    meta: AuthMeta,
  ): Promise<AuthResult> {
    const { user, tokens } = await this.sessions.rotate(rawRefreshToken, audience, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      response: {
        status: 'authenticated',
        user,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      },
      tokens,
      audience,
    };
  }

  async logout(rawRefreshToken: string | undefined, audience: Audience): Promise<void> {
    if (rawRefreshToken) await this.sessions.revokeByRefreshToken(rawRefreshToken, audience);
  }

  async startMfaEnrollment(mfaToken: string): Promise<{ secret: string; otpauthUrl: string }> {
    const payload = await this.tokens.verifyMfaToken(mfaToken);
    if (payload.purpose !== 'mfa:enroll') {
      throw new AppException('AUTH_MFA_INVALID', 400, { reason: 'wrong_mfa_purpose' });
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new AppException('UNAUTHORIZED', 401);
    if (user.mfaEnabled) {
      throw new AppException('AUTH_MFA_INVALID', 409, { reason: 'already_enabled' });
    }

    const enrollment = this.mfa.generateEnrollment(user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaSecretEnc: this.mfa.encrypt(enrollment.secret) },
    });
    await this.audit.write({
      action: 'user.mfa.enrollment_started',
      entityType: 'user',
      entityId: user.id,
      organizationId: payload.org,
      actorUserId: user.id,
      traceId: randomUUID(),
    });
    return enrollment;
  }

  async verifyMfa(
    mfaToken: string,
    code: string,
    meta: AuthMeta,
  ): Promise<AuthResult> {
    const payload = await this.tokens.verifyMfaToken(mfaToken);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new AppException('UNAUTHORIZED', 401);

    if (!this.mfa.verify(code, user.mfaSecretEnc)) {
      throw new AppException('AUTH_MFA_INVALID', 401);
    }

    if (payload.purpose === 'mfa:enroll') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, lastLoginAt: new Date() },
      });
    }

    const context = await this.users.buildContext(user.id, payload.org, payload.targetAudience);
    return this.completeLogin(context, undefined, meta);
  }

  async me(user: AuthenticatedUser): Promise<AuthenticatedUser> {
    return user;
  }

  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const record = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!record?.passwordHash) throw new AppException('UNAUTHORIZED', 401);
    const valid = await verify(record.passwordHash, currentPassword).catch(() => false);
    if (!valid) throw new AppException('UNAUTHORIZED', 401, { reason: 'invalid_password' });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(newPassword), passwordUpdatedAt: new Date() },
    });
    await this.sessions.revokeAllForUser(user.id);
  }

  private async completeLogin(
    user: AuthenticatedUser,
    deviceName: string | undefined,
    meta: AuthMeta,
  ): Promise<AuthResult> {
    const tokens = await this.sessions.issue(user, {
      deviceName,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.write({
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      organizationId: user.organizationId,
      actorUserId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
      after: { audience: user.audience, roleKeys: user.roleKeys },
    });
    return {
      response: {
        status: 'authenticated',
        user,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      },
      tokens,
      audience: user.audience,
    };
  }

  private async registerFailedLogin(user: User): Promise<void> {
    const maxAttempts = this.config.get<number>('AUTH_LOGIN_MAX_ATTEMPTS', 5);
    const lockMinutes = this.config.get<number>('AUTH_LOGIN_LOCK_MINUTES', 15);
    const nextCount = user.failedLoginCount + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: nextCount,
        lockedUntil:
          nextCount >= maxAttempts ? new Date(Date.now() + lockMinutes * 60_000) : null,
      },
    });
    this.logger.warn({ userId: user.id, attempts: nextCount }, 'login_failed');
  }

  async assertPasswordPolicy(password: string): Promise<string> {
    return hash(password, { type: 2 });
  }
}
