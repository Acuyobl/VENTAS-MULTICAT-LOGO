import type { Product, SocialPost } from '@prisma/client';

export interface ImageGenerationInput {
  prompt: string;
  post: SocialPost;
  products: Product[];
}

export interface GeneratedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generate(input: ImageGenerationInput): Promise<GeneratedImage>;
}
