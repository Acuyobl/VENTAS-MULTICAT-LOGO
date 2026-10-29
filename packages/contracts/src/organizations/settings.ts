import { z } from 'zod';
import { imageDesignKeySchema } from '../ai/schemas';
import { appThemeKeySchema } from './theme';

export const orgSettingsSchema = z.object({
  allowSelfApproval: z.boolean(),
  imageDesign: imageDesignKeySchema,
  appTheme: appThemeKeySchema,
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const orgSettingsUpdateSchema = z
  .object({
    allowSelfApproval: z.boolean().optional(),
    imageDesign: imageDesignKeySchema.optional(),
    appTheme: appThemeKeySchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.allowSelfApproval !== undefined ||
      value.imageDesign !== undefined ||
      value.appTheme !== undefined,
    { message: 'Enviá al menos un ajuste.' },
  );

export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>;
