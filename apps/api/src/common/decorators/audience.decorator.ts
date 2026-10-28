import { SetMetadata } from '@nestjs/common';
import type { Audience as AudienceValue } from '@ventascatalogo/contracts';

export const AUDIENCE_KEY = 'vc:audience';
export const Audience = (audience: AudienceValue) => SetMetadata(AUDIENCE_KEY, audience);
