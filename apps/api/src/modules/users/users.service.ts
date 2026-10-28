import { Injectable, Logger } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser, Audience } from '@ventascatalogo/contracts';
import { AppException } from '../../common/errors/app-exception';
import { ConfigService } from '@nestjs/config';

export interface MemberSummary {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  status: string;
  roleKeys: string[];
  joinedAt: string | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  async buildContext(
    userId: string,
    organizationId: string,
    audience: Audience,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new AppException('UNAUTHORIZED', 401, { reason: 'user_inactive' });
    }

    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization) throw new AppException('UNAUTHORIZED', 401, { reason: 'org_not_found' });

    if (audience === 'customer') {
      const account = await this.prisma.customerAccount.findFirst({
        where: { userId, organizationId, status: 'ACTIVE' },
      });
      if (!account) {
        throw new AppException('FORBIDDEN', 403, { reason: 'customer_account_missing' });
      }
    } else {
      const membership = await this.prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new AppException('FORBIDDEN', 403, { reason: 'membership_missing' });
      }
    }

    const { roleKeys, permissions } = await this.permissions.resolve(
      userId,
      organizationId,
      audience,
    );
    const enforceMfa = this.config.get<boolean>('MFA_ENFORCE_ADMINS', true);
    const isAdmin = roleKeys.includes('org_admin') || roleKeys.includes('superadmin');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      audience,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      roleKeys,
      permissions,
      mfaEnabled: user.mfaEnabled,
      mfaEnrollmentRequired: audience === 'staff' && enforceMfa && isAdmin && !user.mfaEnabled,
    };
  }

  async findOrganizationForAudience(userId: string, audience: Audience): Promise<string | null> {
    if (audience === 'customer') {
      const account = await this.prisma.customerAccount.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      return account?.organizationId ?? null;
    }
    const membership = await this.prisma.membership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return membership?.organizationId ?? null;
  }

  async listMembers(organizationId: string): Promise<MemberSummary[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, status: { in: ['ACTIVE', 'INVITED'] } },
      include: {
        user: true,
        assignments: { include: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      fullName: membership.user.fullName,
      status: membership.status,
      roleKeys: [...new Set(membership.assignments.map((assignment) => assignment.role.key))],
      joinedAt: membership.joinedAt?.toISOString() ?? null,
    }));
  }

  async listAssignableRoles(): Promise<
    Array<{ key: string; name: string; description: string | null }>
  > {
    return this.prisma.role.findMany({
      where: { organizationId: null, isSystem: true, key: { not: 'customer' } },
      select: { key: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  async getCustomerSummary(userId: string, organizationId: string): Promise<{
    customerId: string;
    name: string;
    email: string | null;
    orderCount: number;
  } | null> {
    const account = await this.prisma.customerAccount.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
      include: { customer: true },
    });
    if (!account) return null;
    const orderCount = await this.prisma.order.count({
      where: { customerId: account.customerId, organizationId, deletedAt: null },
    });
    return {
      customerId: account.customerId,
      name: account.customer.name,
      email: account.customer.email,
      orderCount,
    };
  }
}
