import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  SKIP_PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { AppException } from '../errors/app-exception';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skip) return true;

    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) {
      throw new AppException('PERMISSION_UNDECLARED', 500);
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new AppException('UNAUTHORIZED', 401);

    const granted = new Set(user.permissions);
    const missing = required.filter(
      (permission) => !granted.has(permission) && !granted.has('*'),
    );
    if (missing.length > 0) {
      throw new AppException('FORBIDDEN', 403, { missing });
    }
    return true;
  }
}
