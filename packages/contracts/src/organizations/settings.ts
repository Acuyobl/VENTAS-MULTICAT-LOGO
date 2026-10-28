import { z } from 'zod';

export const orgSettingsSchema = z.object({
  allowSelfApproval: z.boolean(),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const orgSettingsUpdateSchema = z
  .object({
    allowSelfApproval: z.boolean(),
  })
  .strict();

export type OrgSettingsUpdateInput = z.infer<typeof orgSettingsUpdateSchema>;
