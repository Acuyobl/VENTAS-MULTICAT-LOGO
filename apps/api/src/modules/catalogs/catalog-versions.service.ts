import { Injectable } from '@nestjs/common';
import type { CatalogVersion } from '@prisma/client';
import type { AuthenticatedUser, CatalogVersionSummary } from '@ventascatalogo/contracts';
import { CatalogsRepository } from './catalogs.repository';
import { CatalogVersionsRepository } from './catalog-versions.repository';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

/** Proyección pública de `CatalogVersion` (contrato `catalogVersionSummarySchema`). */
export function toCatalogVersionSummary(version: CatalogVersion): CatalogVersionSummary {
  return {
    id: version.id,
    catalogId: version.catalogId,
    versionNumber: version.versionNumber,
    status: version.status,
    currency: version.currency,
    taxRateBp: version.taxRateBp,
    taxIncluded: version.taxIncluded,
    productCount: version.productCount,
    sourceChecksum: version.sourceChecksum,
    importedAt: version.importedAt?.toISOString() ?? null,
    validatedAt: version.validatedAt?.toISOString() ?? null,
    activatedAt: version.activatedAt?.toISOString() ?? null,
    archivedAt: version.archivedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    isActive: version.status === 'ACTIVE',
  };
}

@Injectable()
export class CatalogVersionsService {
  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly repo: CatalogVersionsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthenticatedUser,
    catalogId: string,
  ): Promise<{ items: CatalogVersionSummary[] }> {
    await this.assertCatalog(user, catalogId);
    const versions = await this.repo.listByCatalog(catalogId);
    return { items: versions.map(toCatalogVersionSummary) };
  }

  async activate(
    user: AuthenticatedUser,
    catalogId: string,
    versionId: string,
    meta: AuditMeta,
  ): Promise<CatalogVersionSummary> {
    await this.assertCatalog(user, catalogId);
    const result = await this.repo.activate(catalogId, versionId);

    if (result.changed) {
      await this.audit.write({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'catalog.version.activated',
        entityType: 'catalog_version',
        entityId: result.version.id,
        before: { status: 'VALIDATED', previousActiveVersionId: result.previousVersionId },
        after: { status: 'ACTIVE', catalogId, versionNumber: result.version.versionNumber },
        ip: meta.ip,
        userAgent: meta.userAgent,
        traceId: meta.traceId,
      });
    }

    return toCatalogVersionSummary(result.version);
  }

  async validate(
    user: AuthenticatedUser,
    catalogId: string,
    versionId: string,
  ): Promise<CatalogVersionSummary> {
    await this.assertCatalog(user, catalogId);
    return toCatalogVersionSummary(await this.repo.validate(catalogId, versionId));
  }

  async archive(
    user: AuthenticatedUser,
    catalogId: string,
    versionId: string,
  ): Promise<CatalogVersionSummary> {
    await this.assertCatalog(user, catalogId);
    return toCatalogVersionSummary(await this.repo.archive(catalogId, versionId));
  }

  /**
   * Un catálogo de otra organización responde `404 CATALOG_NOT_FOUND` (nunca 403,
   * que revelaría su existencia).
   */
  async assertCatalog(user: AuthenticatedUser, catalogId: string) {
    const catalog = await this.catalogs.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);
    return catalog;
  }
}
