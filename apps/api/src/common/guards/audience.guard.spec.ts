import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { AudienceGuard } from './audience.guard';
import { AUDIENCE_KEY } from '../decorators/audience.decorator';
import { AppException } from '../errors/app-exception';

function userWith(audience: 'staff' | 'customer'): AuthenticatedUser {
  return {
    id: '0192f0a0-0000-7000-8000-000000000001',
    email: 'user@qa.ventascatalogo.test',
    fullName: 'Usuario de prueba',
    audience,
    organizationId: '0192f0a0-0000-7000-8000-0000000000aa',
    organizationName: 'Organización Demo',
    organizationSlug: 'demo',
    roleKeys: [],
    permissions: [],
    mfaEnabled: true,
    mfaEnrollmentRequired: false,
  };
}

interface FakeRoute {
  handler: Record<string, unknown> | (() => void);
  controller: new () => unknown;
}

function route(metadata?: { audience?: 'staff' | 'customer'; onClass?: boolean }): FakeRoute {
  const handler = () => undefined;
  class FakeController {}
  if (metadata?.audience) {
    const target = metadata.onClass ? FakeController : handler;
    Reflect.defineMetadata(AUDIENCE_KEY, metadata.audience, target);
  }
  return { handler, controller: FakeController };
}

function contextFor(
  user: AuthenticatedUser | undefined,
  handler: unknown,
  controller: unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AudienceGuard', () => {
  const guard = new AudienceGuard(new Reflector());

  it('deja pasar un token staff a un endpoint @Audience("staff")', () => {
    const { handler, controller } = route({ audience: 'staff' });
    expect(guard.canActivate(contextFor(userWith('staff'), handler, controller))).toBe(true);
  });

  it('deja pasar un token customer a un endpoint @Audience("customer")', () => {
    const { handler, controller } = route({ audience: 'customer' });
    expect(guard.canActivate(contextFor(userWith('customer'), handler, controller))).toBe(true);
  });

  it('rechaza un token customer en endpoint staff con 403 AUTH_WRONG_AUDIENCE y detalles', () => {
    const { handler, controller } = route({ audience: 'staff' });

    const error = (() => {
      try {
        guard.canActivate(contextFor(userWith('customer'), handler, controller));
        return null;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(AppException);
    const appError = error as AppException;
    expect(appError.code).toBe('AUTH_WRONG_AUDIENCE');
    expect(appError.getStatus()).toBe(403);
    expect(appError.details).toEqual({ expected: 'staff', received: 'customer' });
  });

  it('rechaza un token staff en endpoint customer con 403 AUTH_WRONG_AUDIENCE', () => {
    const { handler, controller } = route({ audience: 'customer' });
    expect(() => guard.canActivate(contextFor(userWith('staff'), handler, controller))).toThrow(
      AppException,
    );
  });

  it('lee la audiencia declarada a nivel de clase', () => {
    const { handler, controller } = route({ audience: 'staff', onClass: true });
    expect(guard.canActivate(contextFor(userWith('staff'), handler, controller))).toBe(true);
    expect(() => guard.canActivate(contextFor(userWith('customer'), handler, controller))).toThrow(
      AppException,
    );
  });

  it('sin metadato @Audience no restringe la audiencia', () => {
    const { handler, controller } = route();
    expect(guard.canActivate(contextFor(userWith('customer'), handler, controller))).toBe(true);
  });

  it('si falta el usuario autenticado responde 401 UNAUTHORIZED', () => {
    const { handler, controller } = route({ audience: 'staff' });
    expect(() => guard.canActivate(contextFor(undefined, handler, controller))).toThrow(
      AppException,
    );
    try {
      guard.canActivate(contextFor(undefined, handler, controller));
    } catch (caught) {
      expect((caught as AppException).code).toBe('UNAUTHORIZED');
      expect((caught as AppException).getStatus()).toBe(401);
    }
  });
});
