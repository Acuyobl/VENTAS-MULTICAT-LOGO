import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY, SKIP_PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../errors/app-exception';

function userWithPermissions(permissions: string[]): AuthenticatedUser {
  return {
    id: '0192f0a0-0000-7000-8000-000000000001',
    email: 'user@qa.ventascatalogo.test',
    fullName: 'Usuario de prueba',
    audience: 'staff',
    organizationId: '0192f0a0-0000-7000-8000-0000000000aa',
    organizationName: 'Organización Demo',
    organizationSlug: 'demo',
    roleKeys: ['org_admin'],
    permissions,
    mfaEnabled: true,
    mfaEnrollmentRequired: false,
  };
}

interface RouteMetadata {
  permissions?: string[];
  skip?: boolean;
  publicRoute?: boolean;
  onClass?: boolean;
}

function route(metadata: RouteMetadata = {}): {
  handler: () => void;
  controller: new () => unknown;
} {
  const handler = () => undefined;
  class FakeController {}
  const target = metadata.onClass ? FakeController : handler;
  if (metadata.permissions) Reflect.defineMetadata(PERMISSIONS_KEY, metadata.permissions, target);
  if (metadata.skip) Reflect.defineMetadata(SKIP_PERMISSIONS_KEY, true, target);
  if (metadata.publicRoute) Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
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

function capture(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('deja pasar cuando el usuario tiene todos los permisos requeridos', () => {
    const { handler, controller } = route({ permissions: ['user:manage', 'catalog:read'] });
    const user = userWithPermissions(['user:manage', 'catalog:read', 'product:read']);
    expect(guard.canActivate(contextFor(user, handler, controller))).toBe(true);
  });

  it('rechaza con 403 FORBIDDEN y detalla el permiso faltante', () => {
    const { handler, controller } = route({ permissions: ['user:manage', 'role:create'] });
    const user = userWithPermissions(['user:manage']);
    const error = capture(() => guard.canActivate(contextFor(user, handler, controller)));

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('FORBIDDEN');
    expect((error as AppException).getStatus()).toBe(403);
    expect((error as AppException).details).toEqual({ missing: ['role:create'] });
  });

  it('el comodín "*" concede cualquier permiso', () => {
    const { handler, controller } = route({ permissions: ['user:manage', 'admin:manage'] });
    expect(guard.canActivate(contextFor(userWithPermissions(['*']), handler, controller))).toBe(
      true,
    );
  });

  it('@SkipPermissions deja pasar sin declarar permisos', () => {
    const { handler, controller } = route({ skip: true });
    expect(guard.canActivate(contextFor(userWithPermissions([]), handler, controller))).toBe(true);
  });

  it('@Public deja pasar sin declarar permisos (health, auth)', () => {
    const { handler, controller } = route({ publicRoute: true });
    expect(guard.canActivate(contextFor(undefined, handler, controller))).toBe(true);
  });

  it('un endpoint sin @RequirePermissions falla con 500 PERMISSION_UNDECLARED (deny by default)', () => {
    const { handler, controller } = route();
    const error = capture(() =>
      guard.canActivate(contextFor(userWithPermissions(['user:manage']), handler, controller)),
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('PERMISSION_UNDECLARED');
    expect((error as AppException).getStatus()).toBe(500);
  });

  it('declara el permiso a nivel de clase y lo aplica a sus handlers', () => {
    const { handler, controller } = route({ permissions: ['user:manage'], onClass: true });
    expect(
      guard.canActivate(contextFor(userWithPermissions(['user:manage']), handler, controller)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(userWithPermissions([]), handler, controller)),
    ).toThrow(AppException);
  });

  it('si falta el usuario autenticado responde 401 UNAUTHORIZED', () => {
    const { handler, controller } = route({ permissions: ['user:manage'] });
    const error = capture(() => guard.canActivate(contextFor(undefined, handler, controller)));
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('UNAUTHORIZED');
    expect((error as AppException).getStatus()).toBe(401);
  });
});
