import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductListQuery, VersionedProductSummary } from '@ventascatalogo/contracts';

export interface ProductPage {
  items: VersionedProductSummary[];
  nextCursor: string | null;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Versión del catálogo (sin exponer versiones de otro catálogo/organización). */
  async findVersion(catalogId: string, versionId: string) {
    return this.prisma.catalogVersion.findFirst({
      where: { id: versionId, catalogId },
      select: { id: true, versionNumber: true, status: true },
    });
  }

  /**
   * Listado de productos de **una sola versión** (regla R2: nunca mezcla
   * versiones). Cursor por `id` ascendente como el repositorio de F0.
   */
  async listPage(
    catalogId: string,
    versionId: string,
    query: ProductListQuery,
  ): Promise<ProductPage> {
    const where: Prisma.ProductWhereInput = {
      catalogId,
      catalogVersionId: versionId,
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    };

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      select: {
        id: true,
        catalogId: true,
        catalogVersionId: true,
        sku: true,
        name: true,
        description: true,
        category: true,
        brand: true,
        priceMinor: true,
        costMinor: true,
        currency: true,
        stock: true,
        imageKey: true,
        isActive: true,
      },
    });

    const hasNext = rows.length > query.limit;
    const page = hasNext ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => ({
        ...row,
        priceMinor: row.priceMinor.toString(),
        costMinor: row.costMinor === null ? null : row.costMinor.toString(),
      })),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
