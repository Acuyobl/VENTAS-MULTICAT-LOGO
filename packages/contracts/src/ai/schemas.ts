import { z } from 'zod';

export const socialPlatformSchema = z.enum([
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'WHATSAPP',
  'LINKEDIN',
]);

export const socialToneSchema = z.enum(['CERCANO', 'PROFESIONAL', 'DIVERTIDO', 'PREMIUM']);
export const socialGoalSchema = z.enum(['VENTAS', 'LANZAMIENTO', 'RECORDATORIO', 'EDUCATIVO']);
export const socialPostStatusSchema = z.enum([
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PUBLISHED',
]);

export const socialPostGenerateSchema = z
  .object({
    catalogId: z.string().uuid(),
    platform: socialPlatformSchema,
    tone: socialToneSchema,
    goal: socialGoalSchema,
    productIds: z.array(z.string().uuid()).min(1).max(5),
    extraInstructions: z.string().trim().max(300).optional(),
  })
  .strict();

export type SocialPostGenerateInput = z.infer<typeof socialPostGenerateSchema>;

export const imageDesignKeySchema = z.enum(['CLASICA', 'EDITORIAL', 'PROMO']);
export type ImageDesignKey = z.infer<typeof imageDesignKeySchema>;

export const socialPostSchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  platform: socialPlatformSchema,
  tone: socialToneSchema,
  goal: socialGoalSchema,
  title: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  visualSuggestion: z.string().nullable(),
  status: socialPostStatusSchema,
  imageUrl: z.string().nullable(),
  imagePrompt: z.string().nullable(),
  imageProvider: z.string().nullable(),
  imageDesign: z.string().nullable(),
  aiProvider: z.string(),
  aiModel: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  createdAt: z.string(),
});

export type SocialPost = z.infer<typeof socialPostSchema>;

export const socialPostListResponseSchema = z.object({
  items: z.array(socialPostSchema),
});

export type SocialPostListResponse = z.infer<typeof socialPostListResponseSchema>;

export const socialPostDecisionSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
  })
  .strict();

export type SocialPostDecisionInput = z.infer<typeof socialPostDecisionSchema>;

export const socialPostImageGenerateSchema = z
  .object({
    prompt: z.string().trim().min(3).max(500).optional(),
    design: imageDesignKeySchema.optional(),
  })
  .strict();

export type SocialPostImageGenerateInput = z.infer<typeof socialPostImageGenerateSchema>;

export const imageDesignSchema = z.object({
  key: imageDesignKeySchema,
  label: z.string(),
  description: z.string(),
  previewDataUri: z.string(),
});

export type ImageDesign = z.infer<typeof imageDesignSchema>;

export const imageDesignListResponseSchema = z.object({
  items: z.array(imageDesignSchema),
});

export type ImageDesignListResponse = z.infer<typeof imageDesignListResponseSchema>;

export const whatsappSendSchema = z
  .object({
    template: z.enum(['PAYMENT_REMINDER', 'ORDER_CONFIRMATION']).default('PAYMENT_REMINDER'),
    to: z.string().trim().min(7).max(20).optional(),
  })
  .strict();

export type WhatsappSendInput = z.infer<typeof whatsappSendSchema>;
