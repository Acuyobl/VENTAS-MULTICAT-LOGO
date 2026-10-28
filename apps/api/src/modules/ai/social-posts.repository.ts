import { Injectable } from '@nestjs/common';
import type { Catalog, Product, SocialPost } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CatalogContext {
  catalog: Catalog;
  versionId: string;
  products: Product[];
}

@Injectable()
export class SocialPostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCatalogContext(
    organizationId: string,
    catalogId: string,
    productIds: string[],
  ): Promise<CatalogContext | null> {
    const catalog = await this.prisma.catalog.findFirst({
      where: { id: catalogId, organizationId, deletedAt: null },
    });
    if (!catalog || !catalog.activeVersionId) return null;
    const products = await this.prisma.product.findMany({
      where: {
        catalogId,
        catalogVersionId: catalog.activeVersionId,
        id: { in: productIds },
        deletedAt: null,
      },
    });
    return { catalog, versionId: catalog.activeVersionId, products };
  }

  create(data: {
    organizationId: string;
    catalogId: string;
    catalogVersionId: string;
    platform: string;
    tone: string;
    goal: string;
    title: string;
    body: string;
    hashtags: string[];
    cta: string;
    visualSuggestion: string | null;
    productIds: string[];
    promptTemplateKey: string;
    promptVersion: number;
    aiProvider: string;
    aiModel: string;
    tokensIn: number;
    tokensOut: number;
    costMicroUsd: number;
  }): Promise<SocialPost> {
    return this.prisma.socialPost.create({ data });
  }

  list(organizationId: string, limit: number): Promise<SocialPost[]> {
    return this.prisma.socialPost.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  find(organizationId: string, id: string): Promise<SocialPost | null> {
    return this.prisma.socialPost.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  findOrganizationDesign(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { imageDesign: true },
    });
  }

  updateImage(
    id: string,
    data: {
      imageKey: string;
      imagePrompt: string;
      imageProvider: string;
      imageModel: string;
      imageDesign: string;
    },
  ): Promise<SocialPost> {
    return this.prisma.socialPost.update({ where: { id }, data });
  }

  findProductsByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.product.findMany({ where: { id: { in: ids } } });
  }

  updateStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    approvedByUserId: string | null,
  ): Promise<SocialPost> {
    return this.prisma.socialPost.update({
      where: { id },
      data: { status, approvedByUserId },
    });
  }
}
