import { Module } from '@nestjs/common';
import { AiProviderFactory } from './ai-provider.factory';
import { ImageDesignsController, SocialPostsController } from './ai.controller';
import { SocialPostsRepository } from './social-posts.repository';
import { ImageProviderFactory } from './image/image-provider.factory';
import { SocialPostsService } from './social-posts.service';

@Module({
  controllers: [SocialPostsController, ImageDesignsController],
  providers: [AiProviderFactory, ImageProviderFactory, SocialPostsRepository, SocialPostsService],
  exports: [AiProviderFactory, ImageProviderFactory, SocialPostsService],
})
export class AiModule {}
