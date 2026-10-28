import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  socialPostDecisionSchema,
  socialPostGenerateSchema,
  socialPostImageGenerateSchema,
  type AuthenticatedUser,
  type SocialPost,
  type SocialPostDecisionInput,
  type SocialPostGenerateInput,
  type SocialPostImageGenerateInput,
  type SocialPostListResponse,
} from '@ventascatalogo/contracts';
import { SocialPostsService } from './social-posts.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('ai/social-posts')
@Audience('staff')
export class SocialPostsController {
  constructor(private readonly posts: SocialPostsService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('social:generate')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(socialPostGenerateSchema)) body: SocialPostGenerateInput,
    @Req() req: RequestWithTrace,
  ): Promise<SocialPost> {
    return this.posts.generate(user, body, salesMetaFrom(req));
  }

  @Get()
  @RequirePermissions('social:generate')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: { limit: number },
  ): Promise<SocialPostListResponse> {
    return this.posts.list(user, query.limit);
  }

  @Post(':id/image')
  @HttpCode(200)
  @RequirePermissions('social:generate')
  regenerateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(socialPostImageGenerateSchema)) body: SocialPostImageGenerateInput,
    @Req() req: RequestWithTrace,
  ): Promise<SocialPost> {
    return this.posts.regenerateImage(user, id, body, salesMetaFrom(req));
  }
  @Post(':id/decision')
  @HttpCode(200)
  @RequirePermissions('social:approve')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(socialPostDecisionSchema)) body: SocialPostDecisionInput,
    @Req() req: RequestWithTrace,
  ): Promise<SocialPost> {
    return this.posts.decide(user, id, body, salesMetaFrom(req));
  }
}
