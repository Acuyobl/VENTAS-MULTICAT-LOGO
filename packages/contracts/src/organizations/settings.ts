import { z } from 'zod';
import { imageDesignKeySchema } from '../ai/schemas';

export const orgSettingsSchema = z.object({
  allowSelfApproval: z.boolean(),
  imageDesign: imageDesignKeySchema,
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const orgSettingsUpdateSchema = z
  .object({
    allowSelfApproval: z.boolean().optional(),
    imageDesign: imageDesignKeySchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.allowSelfApproval !== undefined || value.imageDesign !== undefined,
    { message: 'Enviá al menos un ajuste.' },
  );

export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>;
