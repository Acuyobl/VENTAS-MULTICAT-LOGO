import {
  extraFieldProposalSchema,
  importModeSchema,
  type ExtraFieldProposal,
  type ImportMode,
} from '@ventascatalogo/contracts';
import { AppException } from '../../../../common/errors/app-exception';

export interface AdaptiveImportPlan {
  mode: ImportMode;
  extraFields: ExtraFieldProposal[];
  saveTemplate: boolean;
  templateName: string | null;
  useAgent: boolean;
}

/**
 * Normaliza los campos multipart del import adaptativo (`mode`, `extraFields`,
 * `saveTemplate`, `templateName`, `useAgent`). Todos llegan como string.
 */
export function parseAdaptiveImportOptions(body: Record<string, unknown>): AdaptiveImportPlan {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === '') continue;
    cleaned[key] = value;
  }

  const modeParsed = importModeSchema.safeParse(cleaned.mode ?? 'REPLACE');
  if (!modeParsed.success) {
    throw new AppException('VALIDATION_FAILED', 400, {
      fieldErrors: { mode: ['Debe ser REPLACE o MERGE.'] },
    });
  }

  let extraFields: ExtraFieldProposal[] = [];
  if (typeof cleaned.extraFields === 'string') {
    try {
      const parsed = JSON.parse(cleaned.extraFields) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not_array');
      extraFields = parsed.map((candidate) => extraFieldProposalSchema.parse(candidate));
    } catch {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: { extraFields: ['Debe ser un JSON válido de campos extra.'] },
      });
    }
  }

  const truthy = (value: unknown) => value === true || value === 'true' || value === '1';
  return {
    mode: modeParsed.data,
    extraFields,
    saveTemplate: truthy(cleaned.saveTemplate),
    templateName:
      typeof cleaned.templateName === 'string' && cleaned.templateName.trim().length > 0
        ? cleaned.templateName.trim().slice(0, 80)
        : null,
    useAgent: truthy(cleaned.useAgent),
  };
}
