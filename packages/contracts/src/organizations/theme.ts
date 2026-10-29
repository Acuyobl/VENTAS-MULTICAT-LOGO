import { z } from 'zod';

export const appThemeKeySchema = z.enum(['CLASICO', 'MODERNO', 'COMPACTO']);
export type AppThemeKey = z.infer<typeof appThemeKeySchema>;

export const publicAppSettingsSchema = z.object({
  appTheme: appThemeKeySchema,
  organizationName: z.string(),
  organizationSlug: z.string(),
});

export type PublicAppSettings = z.infer<typeof publicAppSettingsSchema>;
