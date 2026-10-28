import { Injectable } from '@nestjs/common';
import type { CatalogVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { apiException } from '../../common/errors/api-error-codes';

export interface ActivateVersionResult {
  version: CatalogVersion;
  previousVersionId: string | null;
  changed: boolean;
}

/**
 * Acceso a `CatalogVersion` para el versionado F1. Las transiciones de estado se
 * hacen en una transacción para que nunca queden dos versiones `ACTIVE` ni un
 * `Catalog.activeVersionId` que apunte a una versión archivada.
 */
@Injectable()
export class CatalogVersionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByCatalog(catalogId: string): Promise<CatalogVersion[]> {
    return this.prisma.catalogVersion.findMany({
      where: { catalogId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  findOne(catalogId: string, versionId: string): Promise<CatalogVersion | null> {
    return this.prisma.catalogVersion.findFirst({ where: { id: versionId, catalogId } });
  }

  async activate(catalogId: string, versionId: string): Promise<ActivateVersionResult> {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.catalogVersion.findFirst({ where: { id: versionId, catalogId } });
      if (!version) throw new AppException('NOT_FOUND', 404);

      // Reactivar la versión que ya está activa es idempotente.
      if (version.status === 'ACTIVE') {
        return { version, previousVersionId: null, changed: false };
      }

      // F1: solo una versión validada y con productos puede activarse. `ARCHIVED`
      // no vuelve atrás (máquina de estados de la versión) y `DRAFT` debe validarse
      // antes de publicarse.
      if (version.status !== 'VALIDATED' || version.productCount === 0) {
        throw apiException(
          'VERSION_NOT_ACTIVATABLE',
          409,
          { status: version.status, productCount: version.productCount },
          'La versión no se puede activar: debe estar validada y tener al menos un producto.',
        );
      }

      const currentActive = await tx.catalogVersion.findFirst({
        where: { catalogId, status: 'ACTIVE' },
        select: { id: true },
      });
      const now = new Date();

      if (currentActive) {
        await tx.catalogVersion.update({
          where: { id: currentActive.id },
          data: { status: 'ARCHIVED', archivedAt: now },
        });
      }

      const updated = await tx.catalogVersion.update({
        where: { id: version.id },
        data: { status: 'ACTIVE', activatedAt: now, archivedAt: null },
      });
      await tx.catalog.update({ where: { id: catalogId }, data: { activeVersionId: version.id } });

      return { version: updated, previousVersionId: currentActive?.id ?? null, changed: true };
    });
  }

  async validate(catalogId: string, versionId: string): Promise<CatalogVersion> {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.catalogVersion.findFirst({ where: { id: versionId, catalogId } });
      if (!version) throw new AppException('NOT_FOUND', 404);
      if (version.status !== 'DRAFT') {
        throw apiException(
          'VERSION_NOT_ACTIVATABLE',
          409,
          { status: version.status },
          'Solo un borrador (DRAFT) puede validarse.',
        );
      }
      return tx.catalogVersion.update({
        where: { id: version.id },
        data: { status: 'VALIDATED', validatedAt: new Date() },
      });
    });
  }

  async archive(catalogId: string, versionId: string): Promise<CatalogVersion> {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.catalogVersion.findFirst({ where: { id: versionId, catalogId } });
      if (!version) throw new AppException('NOT_FOUND', 404);
      if (version.status !== 'ACTIVE' && version.status !== 'VALIDATED') {
        throw apiException(
          'VERSION_NOT_ACTIVATABLE',
          409,
          { status: version.status },
          'Solo una versión activa o validada puede archivarse.',
        );
      }

      const archived = await tx.catalogVersion.update({
        where: { id: version.id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      });

      // Archivar la versión activa deja el catálogo sin versión publicada: se
      // limpia el puntero para que `GET /products` responda 409 NO_ACTIVE_VERSION
      // en lugar de servir productos de una versión archivada.
      await tx.catalog.updateMany({
        where: { id: catalogId, activeVersionId: version.id },
        data: { activeVersionId: null },
      });

      return archived;
    });
  }
}
