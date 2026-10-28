import { Injectable } from '@nestjs/common';
import type { ColumnMapping, ExtraFieldProposal, MappingTemplate } from '@ventascatalogo/contracts';
import type { ImportMappingTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { headersOverlap } from './import/adaptive/heuristic-mapping';

const TEMPLATE_MATCH_THRESHOLD = 0.8;

@Injectable()
export class ImportTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, catalogId: string): Promise<ImportMappingTemplate[]> {
    return this.prisma.importMappingTemplate.findMany({
      where: { organizationId, catalogId },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  find(organizationId: string, catalogId: string, id: string) {
    return this.prisma.importMappingTemplate.findFirst({
      where: { id, organizationId, catalogId },
    });
  }

  /**
   * Busca una plantilla con ≥80% de coincidencia de encabezados (firma exacta o
   * solapamiento de tokens), la más usada primero.
   */
  async findBestMatch(
    organizationId: string,
    catalogId: string,
    headers: readonly string[],
    signature: string,
  ): Promise<ImportMappingTemplate | null> {
    const exact = await this.prisma.importMappingTemplate.findUnique({
      where: { catalogId_headersSignature: { catalogId, headersSignature: signature } },
    });
    if (exact && exact.organizationId === organizationId) return exact;

    const candidates = await this.prisma.importMappingTemplate.findMany({
      where: { organizationId, catalogId },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });
    let best: ImportMappingTemplate | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = headersOverlap(headers, candidate.headers as string[]);
      if (score >= TEMPLATE_MATCH_THRESHOLD && score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  upsert(input: {
    organizationId: string;
    catalogId: string;
    name: string;
    headers: string[];
    headersSignature: string;
    mapping: ColumnMapping;
    extraFields: ExtraFieldProposal[];
    createdByUserId: string;
  }): Promise<ImportMappingTemplate> {
    return this.prisma.importMappingTemplate.upsert({
      where: {
        catalogId_headersSignature: {
          catalogId: input.catalogId,
          headersSignature: input.headersSignature,
        },
      },
      create: {
        organizationId: input.organizationId,
        catalogId: input.catalogId,
        name: input.name,
        headers: input.headers,
        headersSignature: input.headersSignature,
        mapping: input.mapping as Prisma.InputJsonValue,
        extraFields: input.extraFields as unknown as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId,
      },
      update: {
        name: input.name,
        headers: input.headers,
        mapping: input.mapping as Prisma.InputJsonValue,
        extraFields: input.extraFields as unknown as Prisma.InputJsonValue,
      },
    });
  }

  incrementUsage(id: string): Promise<ImportMappingTemplate> {
    return this.prisma.importMappingTemplate.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  async remove(organizationId: string, catalogId: string, id: string): Promise<boolean> {
    const deleted = await this.prisma.importMappingTemplate.deleteMany({
      where: { id, organizationId, catalogId },
    });
    return deleted.count > 0;
  }
}

export function toMappingTemplate(template: ImportMappingTemplate): MappingTemplate {
  return {
    id: template.id,
    catalogId: template.catalogId,
    name: template.name,
    headersSignature: template.headersSignature,
    headers: template.headers as string[],
    mapping: template.mapping as ColumnMapping,
    extraFields: template.extraFields as unknown as ExtraFieldProposal[],
    usageCount: template.usageCount,
    createdAt: template.createdAt.toISOString(),
  };
}
