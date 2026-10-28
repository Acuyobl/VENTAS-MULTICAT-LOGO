import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CustomerCreateInput } from '@ventascatalogo/contracts';

export interface CustomerListQuery {
  q?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: CustomerListQuery) {
    const where: Prisma.CustomerWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    };

    const rows = await this.prisma.customer.findMany({
      where,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const hasNext = rows.length > query.limit;
    const page = hasNext ? rows.slice(0, query.limit) : rows;
    return {
      items: page,
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  find(organizationId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });
  }

  create(organizationId: string, input: CustomerCreateInput) {
    return this.prisma.customer.create({
      data: {
        organizationId,
        type: input.type,
        name: input.fullName,
        taxId: input.idNumber ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
    });
  }
}
