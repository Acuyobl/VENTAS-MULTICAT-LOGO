import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { UsersService } from '../../users/users.service';
import { AppException } from '../../../common/errors/app-exception';

interface CustomerJwtPayload {
  sub: string;
  org: string;
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request & { cookies?: Record<string, string> }) =>
          req?.cookies?.['vc_customer_at'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      audience: config.getOrThrow<string>('AUTH_CUSTOMER_AUDIENCE'),
      issuer: 'ventascatalogo',
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<AuthenticatedUser> {
    if (!payload.org) throw new AppException('UNAUTHORIZED', 401);
    return this.users.buildContext(payload.sub, payload.org, 'customer');
  }
}
