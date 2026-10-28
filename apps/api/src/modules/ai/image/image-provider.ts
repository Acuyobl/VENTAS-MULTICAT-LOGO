import type { ImageDesignKey } from '@ventascatalogo/contracts';
import type { Product, SocialPost } from '@prisma/client';

export interface ProductPhoto {
  buffer: Buffer;
  contentType: string;
}

export interface ImageGenerationInput {
  prompt: string;
  post: SocialPost;
  products: Product[];
  /** Foto del primer producto leída de MinIO (null si no tiene). */
  productImage?: ProductPhoto | null;
  /** Diseño visual elegido (default CLASICA). */
  design?: ImageDesignKey;
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
