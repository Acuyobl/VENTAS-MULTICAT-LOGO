import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  OrgSettings,
  OrgSettingsUpdateInput,
} from '@ventascatalogo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

@Injectable()
export class OrgSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthenticatedUser): Promise<OrgSettings> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { allowSelfApproval: true },
    });
    if (!organization) throw new AppException('NOT_FOUND', 404, { resource: 'organization' });
    return { allowSelfApproval: organization.allowSelfApproval };
  }

  async update(
    user: AuthenticatedUser,
    input: OrgSettingsUpdateInput,
    meta: AuditMeta,
  ): Promise<OrgSettings> {
    const before = await this.get(user);
    const organization = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { allowSelfApproval: input.allowSelfApproval },
      select: { allowSelfApproval: true },
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'organization.settings_updated',
      entityType: 'organization',
      entityId: user.organizationId,
      before,
      after: organization,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return { allowSelfApproval: organization.allowSelfApproval };
  }
}
