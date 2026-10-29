import { Controller, Get, Header, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PublicAppSettings } from '@ventascatalogo/contracts';
import { OrgSettingsService } from './org-settings.service';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const publicAppSettingsQuerySchema = z.object({
  orgSlug: z.string().trim().min(1).max(80).optional(),
});

type PublicAppSettingsQuery = z.infer<typeof publicAppSettingsQuerySchema>;

/**
 * Ajustes mínimos para pintar la app antes del login (`/public/app-settings`).
 * Sin `orgSlug` resuelve la primera organización no eliminada (la demo).
 */
@Controller('public')
export class PublicAppSettingsController {
  constructor(private readonly settings: OrgSettingsService) {}

  @Get('app-settings')
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  get(
    @Query(new ZodValidationPipe(publicAppSettingsQuerySchema)) query: PublicAppSettingsQuery,
  ): Promise<PublicAppSettings> {
    return this.settings.getPublic(query.orgSlug);
  }
}
