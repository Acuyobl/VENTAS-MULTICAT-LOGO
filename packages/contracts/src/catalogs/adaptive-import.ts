import { z } from 'zod';
import { columnMappingSchema } from './versions';

export const columnTypeSchema = z.enum([
  'TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'BOOLEAN',
  'URL',
  'IMAGE',
  'ENUM',
  'UNKNOWN',
]);

export type ColumnType = z.infer<typeof columnTypeSchema>;

export const inferredColumnSchema = z.object({
  header: z.string(),
  normalized: z.string(),
  type: columnTypeSchema,
  samples: z.array(z.string()).max(5),
  emptyRatio: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export type InferredColumn = z.infer<typeof inferredColumnSchema>;

export const extraFieldProposalSchema = z.object({
  column: z.string(),
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(80),
  type: columnTypeSchema,
  unit: z.string().max(20).optional(),
});

export type ExtraFieldProposal = z.infer<typeof extraFieldProposalSchema>;

export const ignoredColumnSchema = z.object({
  column: z.string(),
  reason: z.string().min(1).max(200),
});

export const mappingProposalSchema = z.object({
  mapping: columnMappingSchema,
  extraFields: z.array(extraFieldProposalSchema),
  ignoredColumns: z.array(ignoredColumnSchema),
  warnings: z.array(z.string()),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  headersSignature: z.string(),
  agent: z
    .object({
      provider: z.string(),
      model: z.string(),
      tokensIn: z.number().int(),
      tokensOut: z.number().int(),
      mocked: z.boolean(),
    })
    .nullable(),
});

export type MappingProposal = z.infer<typeof mappingProposalSchema>;

export const importPreviewSchema = z.object({
  headers: z.array(z.string()),
  sampleRows: z.array(z.record(z.string())),
  totalRows: z.number().int(),
  columns: z.array(inferredColumnSchema),
  proposal: mappingProposalSchema,
  preset: z
    .object({ id: z.string().uuid(), name: z.string() })
    .nullable(),
  modeOptions: z.array(z.enum(['REPLACE', 'MERGE'])),
});

export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importModeSchema = z.enum(['REPLACE', 'MERGE']);
export type ImportMode = z.infer<typeof importModeSchema>;

export const mappingTemplateSchema = z.object({
  id: z.string().uuid(),
  catalogId: z.string().uuid(),
  name: z.string(),
  headersSignature: z.string(),
  headers: z.array(z.string()),
  mapping: columnMappingSchema,
  extraFields: z.array(extraFieldProposalSchema),
  usageCount: z.number().int(),
  createdAt: z.string(),
});

export type MappingTemplate = z.infer<typeof mappingTemplateSchema>;

export const mappingTemplateListResponseSchema = z.object({
  items: z.array(mappingTemplateSchema),
});

export type MappingTemplateListResponse = z.infer<typeof mappingTemplateListResponseSchema>;

export const mappingTemplateCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    headers: z.array(z.string()).min(1),
    mapping: columnMappingSchema,
    extraFields: z.array(extraFieldProposalSchema).default([]),
  })
  .strict();

export type MappingTemplateCreateInput = z.infer<typeof mappingTemplateCreateSchema>;

export const catalogCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .optional(),
    description: z.string().trim().max(300).optional(),
  })
  .strict();

export type CatalogCreateInput = z.infer<typeof catalogCreateSchema>;

export const catalogUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .optional(),
    description: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export type CatalogUpdateInput = z.infer<typeof catalogUpdateSchema>;
