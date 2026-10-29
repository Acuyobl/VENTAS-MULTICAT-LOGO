import { Injectable } from '@nestjs/common';
import type {
  AppThemeKey,
  AuthenticatedUser,
  OrgSettings,
  OrgSettingsUpdateInput,
  PublicAppSettings,
} from '@ventascatalogo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

/** Tema válido o default CLASICO si el valor almacenado es desconocido. */
export function normalizeAppTheme(value: string | null | undefined): AppThemeKey {
  return value === 'MODERNO' || value === 'COMPACTO' ? value : 'CLASICO';
}

@Injectable()
export class OrgSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthenticatedUser): Promise<OrgSettings> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { allowSelfApproval: true, imageDesign: true, appTheme: true },
    });
    if (!organization) throw new AppException('NOT_FOUND', 404, { resource: 'organization' });
    return {
      allowSelfApproval: organization.allowSelfApproval,
      imageDesign: organization.imageDesign as OrgSettings['imageDesign'],
      appTheme: normalizeAppTheme(organization.appTheme),
    };
  }

  /** Ajustes públicos para aplicar el tema sin sesión (cacheables TTL corto). */
  async getPublic(orgSlug?: string): Promise<PublicAppSettings> {
    const organization = await this.prisma.organization.findFirst({
      where: { deletedAt: null, ...(orgSlug ? { slug: orgSlug } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { appTheme: true, name: true, slug: true },
    });
    if (!organization) throw new AppException('NOT_FOUND', 404, { resource: 'organization' });
    return {
      appTheme: normalizeAppTheme(organization.appTheme),
      organizationName: organization.name,
      organizationSlug: organization.slug,
    };
  }

  /** PATCH parcial: permite cambiar solo `appTheme`, `imageDesign` o `allowSelfApproval`. */
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
        ...(input.appTheme !== undefined ? { appTheme: input.appTheme } : {}),
      },
      select: { allowSelfApproval: true, imageDesign: true, appTheme: true },
    });
    const after: OrgSettings = {
      allowSelfApproval: organization.allowSelfApproval,
      imageDesign: organization.imageDesign as OrgSettings['imageDesign'],
      appTheme: normalizeAppTheme(organization.appTheme),
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
