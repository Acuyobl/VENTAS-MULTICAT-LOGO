import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditEntry } from '../../common/audit/audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId ?? null,
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: (entry.before ?? null) as never,
          after: (entry.after ?? null) as never,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          traceId: entry.traceId,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'audit_write_failed');
    }
  }
}
