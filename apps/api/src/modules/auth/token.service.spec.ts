import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { TokenService } from './token.service';
import { AppException } from '../../common/errors/app-exception';

const SECRET = 'unit-test-access-secret-0123456789abcdef';
const OTHER_SECRET = 'unit-test-other-secret-fedcba9876543210';

function configWith(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: SECRET,
    JWT_ACCESS_TTL: '15m',
    ...overrides,
  };
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`Missing config key ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

const jwt = new JwtService({});

function audienceUser(audience: 'staff' | 'customer'): AuthenticatedUser {
  return {
    id: '0192f0a0-0000-7000-8000-000000000001',
    email: `user-${audience}@qa.ventascatalogo.test`,
    fullName: 'Usuario de prueba',
    audience,
    organizationId: '0192f0a0-0000-7000-8000-0000000000aa',
    organizationName: 'Organización Demo',
    organizationSlug: 'demo',
    roleKeys: audience === 'staff' ? ['org_admin'] : ['customer'],
    permissions: audience === 'staff' ? ['user:manage'] : ['self:profile:write'],
    mfaEnabled: false,
    mfaEnrollmentRequired: false,
  };
}

describe('TokenService', () => {
  it('firma un access token de staff con aud=staff e issuer ventascatalogo', async () => {
    const service = new TokenService(jwt, configWith());
    const { accessToken } = await service.signAccessToken(audienceUser('staff'));
    const payload = jwt.decode(accessToken) as Record<string, unknown>;

    expect(payload.aud).toBe('staff');
    expect(payload.iss).toBe('ventascatalogo');
    expect(payload.sub).toBe('0192f0a0-0000-7000-8000-000000000001');
    expect(payload.org).toBe('0192f0a0-0000-7000-8000-0000000000aa');
    // El token no lleva los permisos: se resuelven en servidor (AUTHZ-T14).
    expect(payload.permissions).toBeUndefined();
  });

  it('firma un access token de cliente con aud=customer', async () => {
    const service = new TokenService(jwt, configWith());
    const { accessToken } = await service.signAccessToken(audienceUser('customer'));
    const payload = jwt.decode(accessToken) as Record<string, unknown>;

    expect(payload.aud).toBe('customer');
    expect(payload.iss).toBe('ventascatalogo');
  });

  it('respeta JWT_ACCESS_TTL y devuelve expiresAt coherente con exp', async () => {
    const service = new TokenService(jwt, configWith({ JWT_ACCESS_TTL: '15m' }));
    const { accessToken, expiresAt } = await service.signAccessToken(audienceUser('staff'));
    const payload = jwt.decode(accessToken) as { iat: number; exp: number };

    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(expiresAt.getTime()).toBe(payload.exp * 1000);
  });

  it('un access token vencido es rechazado por verificación', async () => {
    const service = new TokenService(jwt, configWith({ JWT_ACCESS_TTL: '1ms' }));
    const { accessToken } = await service.signAccessToken(audienceUser('staff'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(
      jwt.verifyAsync(accessToken, { secret: SECRET, audience: 'staff', issuer: 'ventascatalogo' }),
    ).rejects.toThrow(/expired/i);
  });

  it('un access token de staff no vale como token de cliente (audiencia cruzada)', async () => {
    const service = new TokenService(jwt, configWith());
    const { accessToken } = await service.signAccessToken(audienceUser('staff'));

    await expect(
      jwt.verifyAsync(accessToken, {
        secret: SECRET,
        audience: 'customer',
        issuer: 'ventascatalogo',
      }),
    ).rejects.toThrow(/audience/i);
  });

  it('firma un MFA token con aud=mfa, TTL de 5 minutos y el propósito indicado', async () => {
    const service = new TokenService(jwt, configWith());
    const mfaToken = await service.signMfaToken({
      sub: '0192f0a0-0000-7000-8000-000000000001',
      org: '0192f0a0-0000-7000-8000-0000000000aa',
      targetAudience: 'staff',
      purpose: 'mfa:enroll',
    });
    const payload = jwt.decode(mfaToken) as {
      aud: string;
      iss: string;
      iat: number;
      exp: number;
      purpose: string;
      targetAudience: string;
      sub: string;
      org: string;
    };

    expect(payload.aud).toBe('mfa');
    expect(payload.iss).toBe('ventascatalogo');
    expect(payload.exp - payload.iat).toBe(5 * 60);
    expect(payload.purpose).toBe('mfa:enroll');
    expect(payload.targetAudience).toBe('staff');
    expect(payload.sub).toBe('0192f0a0-0000-7000-8000-000000000001');
    expect(payload.org).toBe('0192f0a0-0000-7000-8000-0000000000aa');
  });

  it('verifyMfaToken devuelve el payload de un token válido', async () => {
    const service = new TokenService(jwt, configWith());
    const mfaToken = await service.signMfaToken({
      sub: '0192f0a0-0000-7000-8000-000000000001',
      org: '0192f0a0-0000-7000-8000-0000000000aa',
      targetAudience: 'staff',
      purpose: 'mfa:login',
    });

    const payload = await service.verifyMfaToken(mfaToken);
    expect(payload.purpose).toBe('mfa:login');
    expect(payload.targetAudience).toBe('staff');
  });

  it('verifyMfaToken rechaza un access token normal (aud distinta) con AUTH_MFA_REQUIRED', async () => {
    const service = new TokenService(jwt, configWith());
    const { accessToken } = await service.signAccessToken(audienceUser('staff'));

    await expect(service.verifyMfaToken(accessToken)).rejects.toMatchObject({
      code: 'AUTH_MFA_REQUIRED',
    });
  });

  it('verifyMfaToken rechaza un token firmado con otro secreto', async () => {
    const service = new TokenService(jwt, configWith());
    const forged = await jwt.signAsync(
      { sub: 'attacker', org: 'x', purpose: 'mfa:login', targetAudience: 'staff' },
      { secret: OTHER_SECRET, audience: 'mfa', issuer: 'ventascatalogo', expiresIn: '5m' },
    );

    const error = await service.verifyMfaToken(forged).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('AUTH_MFA_REQUIRED');
  });
});
