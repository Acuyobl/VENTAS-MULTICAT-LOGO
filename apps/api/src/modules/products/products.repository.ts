import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CursorPageQuery } from '@ventascatalogo/contracts';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPage(catalogId: string, versionId: string, query: CursorPageQuery) {
    const rows = await this.prisma.product.findMany({
      where: {
        catalogId,
        catalogVersionId: versionId,
        deletedAt: null,
        isActive: true,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        category: true,
        brand: true,
        priceMinor: true,
        currency: true,
        stock: true,
        imageKey: true,
      },
    });

    const hasNext = rows.length > query.limit;
    const page = hasNext ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => ({
        ...row,
        priceMinor: row.priceMinor.toString(),
      })),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
