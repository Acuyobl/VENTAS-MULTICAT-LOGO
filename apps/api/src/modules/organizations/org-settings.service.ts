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
      select: { allowSelfApproval: true, imageDesign: true },
    });
    if (!organization) throw new AppException('NOT_FOUND', 404, { resource: 'organization' });
    return {
      allowSelfApproval: organization.allowSelfApproval,
      imageDesign: organization.imageDesign as OrgSettings['imageDesign'],
    };
  }

  /** PATCH parcial: permite cambiar solo `imageDesign` o solo `allowSelfApproval`. */
  async update(
    user: AuthenticatedUser,
    input: OrgSettingsUpdateInput,
    meta: AuditMeta,
  ): Promise<OrgSettings> {
    const before = await this.get(user);
    const organization = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...(input.allowSelfApproval !== undefined
          ? { allowSelfApproval: input.allowSelfApproval }
          : {}),
        ...(input.imageDesign !== undefined ? { imageDesign: input.imageDesign } : {}),
      },
      select: { allowSelfApproval: true, imageDesign: true },
    });
    const after: OrgSettings = {
      allowSelfApproval: organization.allowSelfApproval,
      imageDesign: organization.imageDesign as OrgSettings['imageDesign'],
    };

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'organization.settings_updated',
      entityType: 'organization',
      entityId: user.organizationId,
      before,
      after,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return after;
  }
}
