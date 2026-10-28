import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Audience } from '@ventascatalogo/contracts';
import { AppException } from '../../common/errors/app-exception';

export const CUSTOMER_PERMISSIONS = [
  'self:order:read',
  'self:quote:read',
  'self:payment:read',
  'self:profile:write',
  'self:chat:write',
] as const;

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    userId: string,
    organizationId: string,
    audience: Audience,
  ): Promise<{ roleKeys: string[]; permissions: string[] }> {
    if (audience === 'customer') {
      const account = await this.prisma.customerAccount.findFirst({
        where: { userId, organizationId, status: 'ACTIVE' },
      });
      if (!account) throw new AppException('FORBIDDEN', 403);
      return { roleKeys: ['customer'], permissions: [...CUSTOMER_PERMISSIONS] };
    }

    const catalogIds = await this.prisma.catalog.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });
    const validCatalogIds = new Set(catalogIds.map((catalog) => catalog.id));

    const assignments = await this.prisma.roleAssignment.findMany({
      where: {
        userId,
        membership: { organizationId, status: 'ACTIVE' },
      },
      include: { role: { include: { permissions: true } } },
    });

    const applicable = assignments.filter((assignment) => {
      if (assignment.scopeType === 'GLOBAL') return true;
      if (assignment.scopeType === 'ORGANIZATION') return assignment.scopeId === organizationId;
      return assignment.scopeId ? validCatalogIds.has(assignment.scopeId) : false;
    });

    const roleKeys = [...new Set(applicable.map((assignment) => assignment.role.key))];
    const permissions = [
      ...new Set(
        applicable.flatMap((assignment) =>
          assignment.role.permissions.map((permission) => permission.key),
        ),
      ),
    ];
    return { roleKeys, permissions };
  }
}
