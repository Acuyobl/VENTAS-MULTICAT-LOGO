import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { addDuration } from '../../common/utils/duration';
import type { AuthMeta } from '../auth/auth.service';

export interface InvitationInput {
  email: string;
  roleKey: string;
  scopeType: 'ORGANIZATION' | 'CATALOG';
  scopeId?: string;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    input: InvitationInput,
    meta: AuthMeta,
  ): Promise<{ id: string; email: string; expiresAt: string; emailDelivered: boolean }> {
    const role = await this.prisma.role.findFirst({
      where: {
        key: { equals: input.roleKey, not: 'customer' },
        organizationId: null,
        isSystem: true,
      },
    });
    if (!role) throw new AppException('NOT_FOUND', 404, { reason: 'role_not_found' });

    if (input.scopeType === 'CATALOG') {
      if (!input.scopeId) throw new AppException('VALIDATION_FAILED', 400);
      const catalog = await this.prisma.catalog.findFirst({
        where: { id: input.scopeId, organizationId: actor.organizationId, deletedAt: null },
      });
      if (!catalog) throw new AppException('NOT_FOUND', 404);
    }

    const email = input.email.trim().toLowerCase();
    const raw = randomToken();
    const expiresAt = addDuration(new Date(), '7d');
    const invitation = await this.prisma.userInvitation.create({
      data: {
        organizationId: actor.organizationId,
        email,
        roleId: role.id,
        scopeType: input.scopeType,
        scopeId: input.scopeType === 'CATALOG' ? input.scopeId : null,
        tokenHash: sha256(raw),
        invitedByUserId: actor.id,
        expiresAt,
      },
    });

    const baseUrl = this.config.get<string>('STAFF_PUBLIC_URL', 'http://app.localhost:3000');
    const link = `${baseUrl}/invitacion/${encodeURIComponent(raw)}`;
    const delivered = await this.email.sendInvitation({
      to: email,
      organizationName: actor.organizationName,
      roleName: role.name,
      link,
    });

    await this.audit.write({
      action: 'user.invitation.created',
      entityType: 'user_invitation',
      entityId: invitation.id,
      organizationId: actor.organizationId,
      actorUserId: actor.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
      after: { email, roleKey: role.key, scopeType: input.scopeType, scopeId: input.scopeId },
    });

    return {
      id: invitation.id,
      email,
      expiresAt: expiresAt.toISOString(),
      emailDelivered: delivered,
    };
  }

  async preview(rawToken: string): Promise<{
    email: string;
    organizationName: string;
    roleName: string;
    expiresAt: string;
  }> {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { role: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new AppException('AUTH_INVITATION_EXPIRED', 401);
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
    });
    if (!organization) throw new AppException('AUTH_INVITATION_EXPIRED', 401);
    return {
      email: invitation.email,
      organizationName: organization.name,
      roleName: invitation.role.name,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(
    rawToken: string,
    fullName: string,
    password: string,
    meta: AuthMeta,
  ): Promise<{ email: string; organizationName: string }> {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { role: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new AppException('AUTH_INVITATION_EXPIRED', 401);
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
    });
    if (!organization || organization.deletedAt) {
      throw new AppException('AUTH_INVITATION_EXPIRED', 401);
    }

    const passwordHash = await hash(password);
    // El scope ORGANIZATION se materializa con scopeId = organizationId (igual que el seed);
    // con null, PermissionsService no lo reconoce (exige coincidencia con la organización).
    const assignmentScopeId =
      invitation.scopeType === 'ORGANIZATION'
        ? invitation.organizationId
        : invitation.scopeType === 'CATALOG'
          ? invitation.scopeId
          : null;
    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: invitation.email } });
      const created = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              fullName,
              passwordHash,
              status: 'ACTIVE',
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              passwordUpdatedAt: new Date(),
            },
          })
        : await tx.user.create({
            data: {
              email: invitation.email,
              fullName,
              passwordHash,
              status: 'ACTIVE',
              emailVerifiedAt: new Date(),
              passwordUpdatedAt: new Date(),
            },
          });

      const membership = await tx.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: created.id,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: created.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        update: { status: 'ACTIVE', joinedAt: new Date() },
      });

      const assignment = await tx.roleAssignment.findFirst({
        where: {
          userId: created.id,
          roleId: invitation.roleId,
          scopeType: invitation.scopeType,
          scopeId: assignmentScopeId,
        },
      });
      if (!assignment) {
        await tx.roleAssignment.create({
          data: {
            userId: created.id,
            membershipId: membership.id,
            roleId: invitation.roleId,
            scopeType: invitation.scopeType,
            scopeId: assignmentScopeId,
          },
        });
      }

      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return created;
    });

    await this.audit.write({
      action: 'user.invitation.accepted',
      entityType: 'user',
      entityId: user.id,
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
      after: { roleKey: invitation.role.key, invitationId: invitation.id },
    });

    return { email: user.email, organizationName: organization.name };
  }
}
