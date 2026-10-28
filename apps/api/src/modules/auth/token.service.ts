import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import type { Audience, AuthenticatedUser } from '@ventascatalogo/contracts';
import { AppException } from '../../common/errors/app-exception';

export interface MfaTokenPayload {
  sub: string;
  org: string;
  targetAudience: Audience;
  purpose: 'mfa:login' | 'mfa:enroll';
}

export interface AccessTokenResult {
  accessToken: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signAccessToken(user: AuthenticatedUser): Promise<AccessTokenResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, org: user.organizationId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        audience: user.audience,
        issuer: 'ventascatalogo',
        // La TTL llega como string ("15m"); jsonwebtoken la exige con tipo StringValue.
        expiresIn: this.config.get<string>(
          'JWT_ACCESS_TTL',
          '15m',
        ) as unknown as JwtSignOptions['expiresIn'],
      },
    );
    const decoded = this.jwt.decode(accessToken) as { exp: number };
    return { accessToken, expiresAt: new Date(decoded.exp * 1000) };
  }

  async signMfaToken(payload: MfaTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      audience: 'mfa',
      issuer: 'ventascatalogo',
      expiresIn: '5m',
    });
  }

  async verifyMfaToken(token: string): Promise<MfaTokenPayload> {
    try {
      return await this.jwt.verifyAsync<MfaTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        audience: 'mfa',
        issuer: 'ventascatalogo',
      });
    } catch {
      throw new AppException('AUTH_MFA_REQUIRED', 401, { reason: 'mfa_token_expired' });
    }
  }
}
