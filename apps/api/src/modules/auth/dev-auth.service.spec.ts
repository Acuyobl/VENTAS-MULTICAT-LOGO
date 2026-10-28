import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevAuthService, TOTP_PERIOD_SECONDS } from './dev-auth.service';
import { AppException } from '../../common/errors/app-exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MfaService } from './mfa.service';
import type { TokenService } from './token.service';

const SECRET = 'JBSWY3DPEHPK3PXP';
const ENCRYPTED_SECRET = 'v1:iv:tag:payload';

interface ServiceMocks {
  config: { get: ReturnType<typeof vi.fn> };
  prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };
  tokens: { verifyMfaToken: ReturnType<typeof vi.fn> };
  mfa: { decrypt: ReturnType<typeof vi.fn> };
}

function createService(flag: boolean | string): { service: DevAuthService; mocks: ServiceMocks } {
  const mocks: ServiceMocks = {
    config: {
      get: vi.fn((key: string, fallback?: unknown) =>
        key === 'DEV_AUTH_HELPERS' ? flag : fallback,
      ),
    },
    prisma: { user: { findUnique: vi.fn() } },
    tokens: { verifyMfaToken: vi.fn() },
    mfa: { decrypt: vi.fn().mockReturnValue(SECRET) },
  };

  mocks.tokens.verifyMfaToken.mockResolvedValue({
    sub: 'user-1',
    org: 'org-1',
    targetAudience: 'staff',
    purpose: 'mfa:login',
  });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    status: 'ACTIVE',
    deletedAt: null,
    mfaEnabled: true,
    mfaSecretEnc: ENCRYPTED_SECRET,
  });

  const service = new DevAuthService(
    mocks.config as unknown as ConfigService,
    mocks.prisma as unknown as PrismaService,
    mocks.tokens as unknown as TokenService,
    mocks.mfa as unknown as MfaService,
  );

  return { service, mocks };
}

async function expectAppException(
  promise: Promise<unknown>,
  code: string,
  status: number,
): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.code).toBe(code);
    expect(exception.getStatus()).toBe(status);
    return exception;
  }
  throw new Error(`Se esperaba una AppException ${code}/${status}`);
}

describe('DevAuthService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con el flag apagado responde 404 y no genera nada', async () => {
    const { service, mocks } = createService(false);

    const exception = await expectAppException(
      service.generateTotp('mfa-token-largo'),
      'NOT_FOUND',
      404,
    );

    expect(exception.getResponse()).toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.tokens.verifyMfaToken).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.mfa.decrypt).not.toHaveBeenCalled();
  });

  it('con el flag encendido y secreto genera un TOTP de 6 dígitos', async () => {
    const { service, mocks } = createService('true');

    const result = await service.generateTotp('mfa-token-largo');

    expect(result.code).toMatch(/^\d{6}$/);
    expect(authenticator.check(result.code, SECRET)).toBe(true);
    expect(result.expiresInSeconds).toBeGreaterThanOrEqual(1);
    expect(result.expiresInSeconds).toBeLessThanOrEqual(TOTP_PERIOD_SECONDS);
    const expected = TOTP_PERIOD_SECONDS - (Math.floor(Date.now() / 1000) % TOTP_PERIOD_SECONDS);
    expect(Math.abs(result.expiresInSeconds - expected)).toBeLessThanOrEqual(1);
    expect(mocks.mfa.decrypt).toHaveBeenCalledWith(ENCRYPTED_SECRET);
  });

  it('permite generar el código durante el enrolamiento (secreto creado, mfaEnabled=false)', async () => {
    const { service, mocks } = createService(true);
    mocks.tokens.verifyMfaToken.mockResolvedValue({
      sub: 'user-1',
      org: 'org-1',
      targetAudience: 'staff',
      purpose: 'mfa:enroll',
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      deletedAt: null,
      mfaEnabled: false,
      mfaSecretEnc: ENCRYPTED_SECRET,
    });

    const result = await service.generateTotp('mfa-token-largo');
    expect(authenticator.check(result.code, SECRET)).toBe(true);
  });

  it('usuario sin secreto TOTP → 409 AUTH_MFA_INVALID (mfa_not_enrolled)', async () => {
    const { service, mocks } = createService(true);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      deletedAt: null,
      mfaEnabled: false,
      mfaSecretEnc: null,
    });

    const exception = await expectAppException(
      service.generateTotp('mfa-token-largo'),
      'AUTH_MFA_INVALID',
      409,
    );
    expect(exception.getResponse()).toMatchObject({
      details: { reason: 'mfa_not_enrolled' },
    });
    expect(mocks.mfa.decrypt).not.toHaveBeenCalled();
  });

  it('token de login para un usuario no enrolado → 409 (solo el de enrolamiento puede)', async () => {
    const { service, mocks } = createService(true);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      deletedAt: null,
      mfaEnabled: false,
      mfaSecretEnc: ENCRYPTED_SECRET,
    });

    const exception = await expectAppException(
      service.generateTotp('mfa-token-largo'),
      'AUTH_MFA_INVALID',
      409,
    );
    expect(exception.getResponse()).toMatchObject({ details: { reason: 'mfa_not_enrolled' } });
  });

  it('mfaToken inválido o expirado → 401 AUTH_MFA_REQUIRED', async () => {
    const { service, mocks } = createService(true);
    mocks.tokens.verifyMfaToken.mockRejectedValue(
      new AppException('AUTH_MFA_REQUIRED', 401, { reason: 'mfa_token_expired' }),
    );

    const exception = await expectAppException(
      service.generateTotp('token-vencido'),
      'AUTH_MFA_REQUIRED',
      401,
    );
    expect(exception.getResponse()).toMatchObject({ details: { reason: 'mfa_token_expired' } });
    expect(mocks.mfa.decrypt).not.toHaveBeenCalled();
  });

  it('usuario inexistente o inactivo → 401 AUTH_MFA_REQUIRED', async () => {
    const { service, mocks } = createService(true);
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const exception = await expectAppException(
      service.generateTotp('mfa-token-largo'),
      'AUTH_MFA_REQUIRED',
      401,
    );
    expect(exception.getResponse()).toMatchObject({ details: { reason: 'user_not_found' } });
  });
});
