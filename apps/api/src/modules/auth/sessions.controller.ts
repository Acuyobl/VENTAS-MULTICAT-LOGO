import { Controller, Delete, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { SessionService } from './session.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipPermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';

@Controller('auth/sessions')
@SkipPermissions()
export class SessionsController {
  constructor(
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const sessions = await this.sessions.listForUser(user.id);
    return { items: sessions };
  }

  @Delete(':id')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: Request & { traceId?: string },
  ) {
    await this.sessions.revoke(user.id, id);
    await this.audit.write({
      action: 'auth.session.revoked',
      entityType: 'auth_session',
      entityId: id,
      organizationId: user.organizationId,
      actorUserId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      traceId: req.traceId ?? randomUUID(),
    });
    return { status: 'revoked' };
  }
}
