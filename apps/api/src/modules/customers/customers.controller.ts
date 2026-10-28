import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  customerCreateSchema,
  cursorPageSchema,
  type CustomerCreateInput,
  type CustomerSummary,
} from '@ventascatalogo/contracts';
import { CustomersService } from './customers.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';

const customerListQuerySchema = cursorPageSchema.extend({
  q: z.string().trim().max(120).optional(),
});

type CustomerListQueryInput = z.infer<typeof customerListQuerySchema>;

@Controller('customers')
@Audience('staff')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customer:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQueryInput,
  ): Promise<{ items: CustomerSummary[]; nextCursor: string | null }> {
    return this.customers.list(user.organizationId, query);
  }

  @Post()
  @RequirePermissions('customer:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(customerCreateSchema)) body: CustomerCreateInput,
  ): Promise<CustomerSummary> {
    return this.customers.create(user.organizationId, body);
  }
}
