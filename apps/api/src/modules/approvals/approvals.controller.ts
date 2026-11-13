import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  approvalCreateSchema,
  approvalDecisionSchema,
  approvalStatusSchema,
  type ApprovalCreateInput,
  type ApprovalDecisionInput,
  type ApprovalListResponse,
  type ApprovalRequest,
  type ApprovalStatus,
  type AuthenticatedUser,
} from '@ventascatalogo/contracts';
import { ApprovalsService } from './approvals.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();
const listQuerySchema = z.object({
  status: approvalStatusSchema.optional(),
});

/** Solicitudes de aprobación transversales (dinero, publicación, acciones con efecto). */
@Controller('approvals')
@Audience('staff')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequirePermissions('approval:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: { status?: ApprovalStatus },
  ): Promise<ApprovalListResponse> {
    return this.approvals.list(user.organizationId, query.status);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('approval:read')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(approvalCreateSchema)) body: ApprovalCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<ApprovalRequest> {
    return this.approvals.create(user.organizationId, user.id, body, salesMetaFrom(req));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @RequirePermissions('approval:decide')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(approvalDecisionSchema)) body: ApprovalDecisionInput,
    @Req() req: RequestWithTrace,
  ): Promise<ApprovalRequest> {
    return this.approvals.decide(user.organizationId, user, id, body, salesMetaFrom(req));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('approval:read')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithTrace,
  ): Promise<ApprovalRequest> {
    return this.approvals.cancel(user.organizationId, user, id, salesMetaFrom(req));
  }
}
