import { Module } from '@nestjs/common';
import { AiProviderFactory } from './ai-provider.factory';
import { SocialPostsController } from './ai.controller';
import { SocialPostsRepository } from './social-posts.repository';
import { SocialPostsService } from './social-posts.service';

@Module({
  controllers: [SocialPostsController],
  providers: [AiProviderFactory, SocialPostsRepository, SocialPostsService],
  exports: [SocialPostsService],
})
export class AiModule {}
