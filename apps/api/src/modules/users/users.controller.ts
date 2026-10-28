import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  acceptInvitationSchema,
  invitationCreateSchema,
  invitationTokenSchema,
} from '@ventascatalogo/contracts';
import { UsersService } from './users.service';
import { InvitationsService } from './invitations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthMeta } from '../auth/auth.service';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';

interface RequestWithTrace extends Request {
  traceId?: string;
}

function metaFrom(req: RequestWithTrace): AuthMeta {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    traceId: req.traceId ?? randomUUID(),
  };
}

@Controller('users')
@Audience('staff')
@RequirePermissions('user:manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const [items, roles] = await Promise.all([
      this.users.listMembers(user.organizationId),
      this.users.listAssignableRoles(),
    ]);
    return { items, roles };
  }
}

@Controller('users/invitations')
@Audience('staff')
@RequirePermissions('user:manage')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestWithTrace,
    @Body(new ZodValidationPipe(invitationCreateSchema))
    body: {
      email: string;
      roleKey: string;
      scopeType: 'ORGANIZATION' | 'CATALOG';
      scopeId?: string;
    },
  ) {
    return this.invitations.create(user, body, metaFrom(req));
  }
}

@Controller('auth/invitation')
@Public()
export class InvitationAcceptanceController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  preview(@Query(new ZodValidationPipe(invitationTokenSchema)) query: { token: string }) {
    return this.invitations.preview(query.token);
  }

  @Post('accept')
  accept(
    @Req() req: RequestWithTrace,
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: { token: string; fullName: string; password: string },
  ) {
    return this.invitations.accept(body.token, body.fullName, body.password, metaFrom(req));
  }
}
