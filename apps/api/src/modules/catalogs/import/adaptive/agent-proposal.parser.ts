import {
  extraFieldProposalSchema,
  ignoredColumnSchema,
  type ColumnMapping,
  type ExtraFieldProposal,
} from '@ventascatalogo/contracts';
import { findHeader, IMPORT_FIELDS, type ImportField } from '../normalize-header';

export interface AgentProposalCandidate {
  mapping: ColumnMapping;
  extraFields: ExtraFieldProposal[];
  ignoredColumns: Array<{ column: string; reason: string }>;
  warnings: string[];
  explanation: string;
  confidence: number;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

/**
 * Parsea y valida la propuesta del agente (B). Nunca lanza: si el JSON es
 * inválido o no trae nada útil devuelve `null` para que el servicio aplique el
 * fallback heurístico.
 */
export function parseAgentProposal(
  text: string,
  headers: readonly string[],
): AgentProposalCandidate | null {
  let raw: Record<string, unknown>;
  try {
    const parsed = JSON.parse(stripFences(text)) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const mapping: ColumnMapping = {};
  const usedColumns = new Set<string>();
  const rawMapping =
    raw.mapping && typeof raw.mapping === 'object' ? (raw.mapping as Record<string, unknown>) : {};
  for (const field of IMPORT_FIELDS) {
    const value = rawMapping[field];
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const header = findHeader(headers, value);
    if (!header || usedColumns.has(header)) continue;
    mapping[field as ImportField] = header;
    usedColumns.add(header);
  }

  const ignoredColumnNames = new Set<string>();
  const rawIgnored = Array.isArray(raw.ignoredColumns) ? raw.ignoredColumns : [];
  for (const candidate of rawIgnored) {
    const parsedIgnored = ignoredColumnSchema.safeParse(candidate);
    if (!parsedIgnored.success) continue;
    const header = findHeader(headers, parsedIgnored.data.column);
    if (header) ignoredColumnNames.add(header);
  }

  const extraFields: ExtraFieldProposal[] = [];
  if (Array.isArray(raw.extraFields)) {
    for (const candidate of raw.extraFields) {
      const parsed = extraFieldProposalSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const header = findHeader(headers, parsed.data.column);
      if (!header || usedColumns.has(header) || ignoredColumnNames.has(header)) continue;
      extraFields.push({ ...parsed.data, column: header });
      usedColumns.add(header);
    }
  }

  const ignoredColumns: Array<{ column: string; reason: string }> = [];
  if (Array.isArray(raw.ignoredColumns)) {
    for (const candidate of raw.ignoredColumns) {
      const parsed = ignoredColumnSchema.safeParse(candidate);
      if (!parsed.success) continue;
      const header = findHeader(headers, parsed.data.column);
      if (!header) continue;
      ignoredColumns.push({ column: header, reason: parsed.data.reason.slice(0, 200) });
    }
  }

  if (Object.keys(mapping).length === 0 && extraFields.length === 0) return null;

  const confidenceValue = typeof raw.confidence === 'number' ? raw.confidence : 0.6;
  return {
    mapping,
    extraFields,
    ignoredColumns,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((item): item is string => typeof item === 'string').slice(0, 10)
      : [],
    explanation:
      typeof raw.explanation === 'string' && raw.explanation.trim().length > 0
        ? raw.explanation.trim().slice(0, 1000)
        : 'Propuesta generada por el agente de IA.',
    confidence: Math.min(1, Math.max(0, confidenceValue)),
  };
}
