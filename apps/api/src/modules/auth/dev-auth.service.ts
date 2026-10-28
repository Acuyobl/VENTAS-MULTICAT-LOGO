import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { MfaService } from './mfa.service';
import { AppException } from '../../common/errors/app-exception';

/** Período del TOTP de otplib (paso de 30 s). */
export const TOTP_PERIOD_SECONDS = 30;

export interface DevTotpResult {
  code: string;
  expiresInSeconds: number;
}

/**
 * Helper de MFA **solo para desarrollo**: genera el TOTP del usuario a partir de
 * un `mfaToken` para que el login staff pueda autocompletar el campo.
 *
 * - Apagado por defecto: con `DEV_AUTH_HELPERS=false` el endpoint responde 404
 *   como si no existiera.
 * - `validateEnv` aborta el arranque si se combina con `NODE_ENV=production`.
 * - No sustituye la verificación del código: `/auth/mfa/verify` sigue validando
 *   el TOTP con `authenticator.verify`.
 */
@Injectable()
export class DevAuthService {
  private readonly logger = new Logger(DevAuthService.name);
  private warned = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
  ) {}

  isEnabled(): boolean {
    const value = this.config.get<boolean | string>('DEV_AUTH_HELPERS', false);
    return value === true || value === 'true';
  }

  /** Código TOTP vigente y segundos que le quedan antes de rotar. */
  async generateTotp(mfaToken: string): Promise<DevTotpResult> {
    this.assertEnabled();
    this.warnOnce();

    const payload = await this.tokens.verifyMfaToken(mfaToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, deletedAt: true, mfaEnabled: true, mfaSecretEnc: true },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new AppException('AUTH_MFA_REQUIRED', 401, { reason: 'user_not_found' });
    }

    // Durante el enrolamiento el secreto ya existe pero `mfaEnabled` todavía es
    // false (se activa al verificar el primer TOTP): ese es justamente el caso que
    // el helper debe poder resolver.
    const enrolled =
      Boolean(user.mfaSecretEnc) && (user.mfaEnabled || payload.purpose === 'mfa:enroll');
    if (!enrolled) {
      throw new AppException('AUTH_MFA_INVALID', 409, { reason: 'mfa_not_enrolled' });
    }

    const secret = this.mfa.decrypt(user.mfaSecretEnc as string);
    const code = authenticator.generate(secret);
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      code,
      expiresInSeconds: TOTP_PERIOD_SECONDS - (nowSeconds % TOTP_PERIOD_SECONDS),
    };
  }

  /** 404 en vez de 403 para no revelar la existencia del helper cuando está apagado. */
  private assertEnabled(): void {
    if (!this.isEnabled()) throw new AppException('NOT_FOUND', 404);
  }

  private warnOnce(): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(
      'DEV_AUTH_HELPERS=true: POST /auth/dev/totp habilitado (solo desarrollo, jamás producción).',
    );
  }
}
