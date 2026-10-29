import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Audience } from '@ventascatalogo/contracts';

@Injectable()
export class CatalogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertMember(organizationId: string, userId: string, audience: Audience): Promise<boolean> {
    if (audience === 'customer') {
      const account = await this.prisma.customerAccount.findFirst({
        where: { organizationId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      return Boolean(account);
    }
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { status: true },
    });
    return membership?.status === 'ACTIVE';
  }

  async findForMember(
    catalogId: string,
    userId: string,
    audience: Audience,
    organizationId: string,
  ) {
    const member = await this.assertMember(organizationId, userId, audience);
    if (!member) return null;

    return this.prisma.catalog.findFirst({
      where: { id: catalogId, organizationId, deletedAt: null },
      include: { activeVersion: true },
    });
  }

  findCatalogBySlug(organizationId: string, slug: string) {
    return this.prisma.catalog.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    });
  }

  createCatalog(input: {
    organizationId: string;
    name: string;
    slug: string;
    description: string | null;
  }) {
    return this.prisma.catalog.create({ data: input });
  }

  updateCatalog(
    id: string,
    data: {
      name?: string;
      slug?: string;
      description?: string | null;
    },
  ) {
    return this.prisma.catalog.update({
      where: { id },
      data,
    });
  }

  countActiveProducts(versionId: string): Promise<number> {
    return this.prisma.product.count({
      where: { catalogVersionId: versionId, deletedAt: null, isActive: true },
    });
  }

  async findVersion(catalogId: string, versionId: string) {
    return this.prisma.catalogVersion.findFirst({
      where: { id: versionId, catalogId },
      select: { id: true, status: true },
    });
  }

  async listForMember(organizationId: string, userId: string, audience: Audience) {
    const member = await this.assertMember(organizationId, userId, audience);
    if (!member) return [];

    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId, scopeType: 'CATALOG' },
      select: { scopeId: true },
    });
    const scopedCatalogIds = assignments
      .map((assignment) => assignment.scopeId)
      .filter((id): id is string => Boolean(id));

    const catalogs = await this.prisma.catalog.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(audience === 'staff' && scopedCatalogIds.length > 0
          ? { id: { in: scopedCatalogIds } }
          : {}),
      },
      include: {
        activeVersion: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const relevantVersionIds = catalogs
      .map((catalog) => catalog.activeVersionId ?? catalog.versions[0]?.id)
      .filter((id): id is string => Boolean(id));

    const counts = await this.prisma.product.groupBy({
      by: ['catalogVersionId'],
      where: {
        catalogVersionId: {
          in: relevantVersionIds,
        },
        deletedAt: null,
        isActive: true,
      },
      _count: { _all: true },
    });
    const countByVersion = new Map(counts.map((row) => [row.catalogVersionId, row._count._all]));

    return catalogs.map((catalog) => {
      const activeOrLatestId = catalog.activeVersionId ?? catalog.versions[0]?.id;
      const productCount = activeOrLatestId ? (countByVersion.get(activeOrLatestId) ?? 0) : 0;
      return {
        catalog,
        latestVersion: catalog.versions[0] ?? null,
        productCount,
      };
    });
  }

  async findPublicBySlug(slug: string) {
    return this.prisma.catalog.findFirst({
      where: { slug, deletedAt: null, activeVersionId: { not: null } },
      include: {
        organization: { select: { name: true, slug: true } },
        activeVersion: {
          include: {
            products: {
              where: { deletedAt: null, isActive: true },
              orderBy: { name: 'asc' },
              take: 120,
            },
          },
        },
      },
    });
  }
  findCatalogForDelete(organizationId: string, catalogId: string) {
    return this.prisma.catalog.findFirst({
      where: { id: catalogId, organizationId, deletedAt: null },
      select: { id: true, name: true, slug: true, activeVersionId: true },
    });
  }

  countOpenOrders(catalogId: string): Promise<number> {
    return this.prisma.order.count({
      where: {
        catalogId,
        deletedAt: null,
        status: { in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID'] },
      },
    });
  }

  /** Soft delete + slug liberado + archiva la versión activa (público 404). */
  async softDeleteCatalog(
    catalogId: string,
    activeVersionId: string | null,
    deletedSlug: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.catalog.update({
        where: { id: catalogId },
        data: { deletedAt: new Date(), activeVersionId: null, slug: deletedSlug },
      });
      if (activeVersionId) {
        await tx.catalogVersion.updateMany({
          where: { id: activeVersionId, status: 'ACTIVE' },
          data: { status: 'ARCHIVED', archivedAt: new Date() },
        });
      }
    });
  }
}
