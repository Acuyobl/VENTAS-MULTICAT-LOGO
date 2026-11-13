import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  routineUpdateSchema,
  type AuthenticatedUser,
  type Routine,
  type RoutineListResponse,
  type RoutineRun,
  type RoutineUpdateInput,
} from '@ventascatalogo/contracts';
import { RoutinesService } from './routines.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

/** Rutinas programadas de la organización. */
@Controller('routines')
@Audience('staff')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  @RequirePermissions('routine:read')
  list(@CurrentUser() user: AuthenticatedUser): Promise<RoutineListResponse> {
    return this.routines.list(user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('routine:manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(routineUpdateSchema)) body: RoutineUpdateInput,
  ): Promise<Routine> {
    return this.routines.update(user.organizationId, id, body);
  }

  @Post(':id/run')
  @HttpCode(200)
  @RequirePermissions('routine:manage')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<RoutineRun> {
    return this.routines.runNow(user.organizationId, user, id);
  }
}
