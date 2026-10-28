import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatMoney,
  type AuthenticatedUser,
  type SocialPost,
  type SocialPostDecisionInput,
  type SocialPostGenerateInput,
  type SocialPostListResponse,
} from '@ventascatalogo/contracts';
import { AiError, computeCostMicroUsd } from '@ventascatalogo/ai';
import type { SocialPost as SocialPostRow } from '@prisma/client';
import { AiProviderFactory } from './ai-provider.factory';
import { buildSocialPrompt, type SocialPromptProduct } from './prompt-builder';
import { parseSocialPostText } from './social-post.parser';
import { SocialPostsRepository } from './social-posts.repository';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

@Injectable()
export class SocialPostsService {
  private readonly logger = new Logger(SocialPostsService.name);

  constructor(
    private readonly repo: SocialPostsRepository,
    private readonly providerFactory: AiProviderFactory,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async generate(
    user: AuthenticatedUser,
    input: SocialPostGenerateInput,
    meta: AuditMeta,
  ): Promise<SocialPost> {
    const context = await this.repo.findCatalogContext(
      user.organizationId,
      input.catalogId,
      input.productIds,
    );
    if (!context) {
      throw new AppException('NOT_FOUND', 404, { resource: 'catalog' });
    }
    const productsById = new Map(context.products.map((product) => [product.id, product]));
    const missing = input.productIds.filter((id) => !productsById.has(id));
    if (missing.length > 0) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'products_not_in_active_version',
        missing,
      });
    }

    const products: SocialPromptProduct[] = input.productIds.map((id) => {
      const product = productsById.get(id)!;
      return {
        sku: product.sku,
        name: product.name,
        description: product.description,
        price: formatMoney(product.priceMinor, product.currency),
        currency: product.currency,
        category: product.category,
        stock: product.stock ?? 0,
      };
    });

    const prompt = buildSocialPrompt({
      brandVoice: [context.catalog.name, context.catalog.description ?? ''].join('. ').trim(),
      platform: input.platform,
      tone: input.tone,
      goal: input.goal,
      products,
      extraInstructions: input.extraInstructions,
    });

    const provider = this.providerFactory.createProvider();
    let completion;
    try {
      completion = await provider.complete({
        model: this.providerFactory.modelName(provider),
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        maxOutputTokens: this.config.get<number>('AI_MAX_OUTPUT_TOKENS', 1200),
        temperature: 0.7,
      });
    } catch (error) {
      this.logger.error({ err: error }, 'ai_social_post_failed');
      if (error instanceof AiError) {
        throw new AppException('AI_PROVIDER_ERROR', 502, {
          code: error.code,
          provider: provider.name,
        });
      }
      throw new AppException('AI_PROVIDER_ERROR', 502, { provider: provider.name });
    }

    const parsed = parseSocialPostText(completion.text);
    const pricing = {
      usdPer1kInput: this.config.get<number>('AI_USD_PER_1K_INPUT', 0.00027),
      usdPer1kOutput: this.config.get<number>('AI_USD_PER_1K_OUTPUT', 0.0011),
    };
    const costMicroUsd = computeCostMicroUsd(
      completion.usage.tokensIn,
      completion.usage.tokensOut,
      pricing,
    );

    const post = await this.repo.create({
      organizationId: user.organizationId,
      catalogId: context.catalog.id,
      catalogVersionId: context.versionId,
      platform: input.platform,
      tone: input.tone,
      goal: input.goal,
      title: parsed.title,
      body: parsed.body,
      hashtags: parsed.hashtags,
      cta: parsed.cta,
      visualSuggestion: parsed.visualSuggestion,
      productIds: input.productIds,
      promptTemplateKey: prompt.templateKey,
      promptVersion: prompt.version,
      aiProvider: completion.provider,
      aiModel: completion.model,
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      costMicroUsd,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'ai.social_post_generated',
      entityType: 'social_post',
      entityId: post.id,
      after: {
        provider: post.aiProvider,
        model: post.aiModel,
        tokensIn: post.tokensIn,
        tokensOut: post.tokensOut,
        promptTemplateKey: post.promptTemplateKey,
        promptVersion: post.promptVersion,
        platform: post.platform,
        productIds: input.productIds,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toSocialPost(post);
  }

  async list(user: AuthenticatedUser, limit: number): Promise<SocialPostListResponse> {
    const rows = await this.repo.list(user.organizationId, limit);
    return { items: rows.map(toSocialPost) };
  }

  async decide(
    user: AuthenticatedUser,
    postId: string,
    input: SocialPostDecisionInput,
    meta: AuditMeta,
  ): Promise<SocialPost> {
    const post = await this.repo.find(user.organizationId, postId);
    if (!post) throw new AppException('NOT_FOUND', 404, { resource: 'socialPost' });

    const updated = await this.repo.updateStatus(
      post.id,
      input.status,
      input.status === 'APPROVED' ? user.id : null,
    );

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'social.post_decided',
      entityType: 'social_post',
      entityId: post.id,
      before: { status: post.status },
      after: { status: updated.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toSocialPost(updated);
  }
}

export function toSocialPost(post: SocialPostRow): SocialPost {
  return {
    id: post.id,
    catalogId: post.catalogId,
    platform: post.platform as SocialPost['platform'],
    tone: post.tone as SocialPost['tone'],
    goal: post.goal as SocialPost['goal'],
    title: post.title,
    body: post.body,
    hashtags: post.hashtags,
    cta: post.cta,
    visualSuggestion: post.visualSuggestion,
    status: post.status,
    aiProvider: post.aiProvider,
    aiModel: post.aiModel,
    tokensIn: post.tokensIn,
    tokensOut: post.tokensOut,
    createdAt: post.createdAt.toISOString(),
  };
}
