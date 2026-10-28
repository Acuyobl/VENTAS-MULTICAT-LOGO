import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, Audience as AudienceType } from '@ventascatalogo/contracts';
import { AUDIENCE_KEY } from '../decorators/audience.decorator';
import { AppException } from '../errors/app-exception';

@Injectable()
export class AudienceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.reflector.getAllAndOverride<AudienceType>(AUDIENCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!expected) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new AppException('UNAUTHORIZED', 401);
    if (user.audience !== expected) {
      throw new AppException('AUTH_WRONG_AUDIENCE', 403, {
        expected,
        received: user.audience,
      });
    }
    return true;
  }
}
