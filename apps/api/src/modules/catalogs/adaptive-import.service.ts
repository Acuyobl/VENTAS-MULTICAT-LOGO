import { Injectable, Logger } from '@nestjs/common';
import {
  columnMappingSchema,
  type AuthenticatedUser,
  type ColumnMapping,
  type ExtraFieldProposal,
  type ImportPreview,
  type MappingProposal,
  type MappingTemplate,
  type MappingTemplateCreateInput,
} from '@ventascatalogo/contracts';
import type { AiCompletionResult } from '@ventascatalogo/ai';
import type { AgentProposalCandidate } from './import/adaptive/agent-proposal.parser';
import { CatalogsRepository } from './catalogs.repository';
import { ImportTemplatesRepository, toMappingTemplate } from './import-templates.repository';
import { AiProviderFactory } from '../ai/ai-provider.factory';
import {
  MAX_IMPORT_FILE_BYTES,
  parseImportOptions,
  resolveImportExtension,
} from './imports.service';
import {
  ImportParseError,
  parseImportFile,
  type ImportFileExtension,
} from './import/parse-import-file';
import { inferColumns } from './import/adaptive/infer-columns';
import { buildHeuristicProposal, headersSignature } from './import/adaptive/heuristic-mapping';
import { parseAgentProposal } from './import/adaptive/agent-proposal.parser';
import { AppException } from '../../common/errors/app-exception';
import { apiException } from '../../common/errors/api-error-codes';
import { z } from 'zod';
import type { AuditMeta } from '../../common/audit/audit.types';
import { AuditService } from '../audit/audit.service';

const AGENT_MAX_TOKENS = 900;
const previewBodySchema = z.object({
  useAgent: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform(
      (value) => value === undefined || value === true || value === 'true' || value === '1',
    ),
  delimiter: z.string().max(1).optional(),
});

export interface PreviewInput {
  user: AuthenticatedUser;
  catalogId: string;
  file: Express.Multer.File | undefined;
  body: Record<string, unknown>;
  meta: AuditMeta;
}

@Injectable()
export class AdaptiveImportService {
  private readonly logger = new Logger(AdaptiveImportService.name);
  private readonly cache = new Map<string, ImportPreview>();

  constructor(
    private readonly catalogs: CatalogsRepository,
    private readonly templates: ImportTemplatesRepository,
    private readonly aiFactory: AiProviderFactory,
    private readonly audit: AuditService,
  ) {}

  async preview(input: PreviewInput): Promise<ImportPreview> {
    const { user, catalogId, file } = input;
    const catalog = await this.catalogs.findForMember(
      catalogId,
      user.id,
      user.audience,
      user.organizationId,
    );
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);
    if (!file?.buffer?.length) {
      throw apiException(
        'INVALID_IMPORT_FILE',
        400,
        { field: 'file' },
        'Falta el archivo en el campo "file".',
      );
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw apiException(
        'INVALID_IMPORT_FILE',
        400,
        { maxBytes: MAX_IMPORT_FILE_BYTES, size: file.size },
        'El archivo supera el límite de 10 MB.',
      );
    }

    const parsedBody = previewBodySchema.safeParse(input.body);
    const useAgent = parsedBody.success ? parsedBody.data.useAgent : true;
    const delimiter = parsedBody.success ? parsedBody.data.delimiter : undefined;
    const options = parseImportOptions({ delimiter });
    const extension = resolveImportExtension(file.originalname);
    const parsed = this.parseFile(file.buffer, extension, options.delimiter);

    const headers = parsed.headers;
    const rows = parsed.rows;
    const signature = headersSignature(headers);
    const explicitMapping = this.parseExplicitMapping(input.body.mapping);

    const columns = inferColumns(headers, rows);
    const template = await this.templates.findBestMatch(
      user.organizationId,
      catalogId,
      headers,
      signature,
    );
    // El cache incluye la plantilla: si aparece/actualiza una plantilla, el
    // preview se recalcula en vez de devolver el preset viejo.
    const cacheKey = [
      user.organizationId,
      catalogId,
      signature,
      useAgent ? 'agent' : 'agent-off',
      explicitMapping ? JSON.stringify(explicitMapping) : 'auto',
      template ? `${template.id}:${template.updatedAt.toISOString()}` : 'no-template',
    ].join('|');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const baseMapping = explicitMapping ?? (template?.mapping as ColumnMapping | undefined);
    const baseExtraFields = template?.extraFields as ExtraFieldProposal[] | undefined;
    const heuristic = buildHeuristicProposal({
      headers,
      columns,
      signature,
      baseMapping,
      baseExtraFields,
      presetName: template?.name,
    });
    if (parsed.sheetSelection) {
      heuristic.warnings.unshift(`Pestañas: ${parsed.sheetSelection}`);
    }
    let proposal: MappingProposal = {
      ...heuristic,
      agent: null,
    };
    if (useAgent) {
      const agentProposal = await this.tryAgent(headers, columns, rows, heuristic);
      if (agentProposal) {
        proposal = agentProposal;
      } else {
        proposal = {
          ...heuristic,
          warnings: [
            ...heuristic.warnings,
            'La IA no está disponible o no devolvió una propuesta válida; se usó la heurística determinista.',
          ],
          agent: null,
        };
      }
    }

    const preview: ImportPreview = {
      headers,
      sampleRows: rows
        .slice(0, 5)
        .map((row) =>
          Object.fromEntries(headers.map((header) => [header, String(row[header] ?? '')])),
        ),
      totalRows: rows.length,
      columns,
      proposal,
      preset: template ? { id: template.id, name: template.name } : null,
      modeOptions: ['REPLACE', 'MERGE'],
    };

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'import.preview_analyzed',
      entityType: 'catalog',
      entityId: catalogId,
      after: {
        headersSignature: signature,
        agent: proposal.agent?.provider ?? 'heuristic',
        confidence: proposal.confidence,
        presetId: template?.id ?? null,
        totalRows: preview.totalRows,
      },
      ip: input.meta.ip,
      userAgent: input.meta.userAgent,
      traceId: input.meta.traceId,
    });

    this.cache.set(cacheKey, preview);
    return preview;
  }

  async listTemplates(
    organizationId: string,
    catalogId: string,
  ): Promise<{ items: MappingTemplate[] }> {
    const templates = await this.templates.list(organizationId, catalogId);
    return { items: templates.map(toMappingTemplate) };
  }

  async createTemplate(
    user: AuthenticatedUser,
    catalogId: string,
    input: MappingTemplateCreateInput,
    meta: AuditMeta,
  ): Promise<MappingTemplate> {
    const template = await this.templates.upsert({
      organizationId: user.organizationId,
      catalogId,
      name: input.name,
      headers: input.headers,
      headersSignature: headersSignature(input.headers),
      mapping: input.mapping,
      extraFields: input.extraFields,
      createdByUserId: user.id,
    });
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'import.template_saved',
      entityType: 'import_mapping_template',
      entityId: template.id,
      after: { catalogId, name: template.name, headersSignature: template.headersSignature },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return toMappingTemplate(template);
  }

  async removeTemplate(
    user: AuthenticatedUser,
    catalogId: string,
    templateId: string,
    meta: AuditMeta,
  ): Promise<{ id: string; deleted: true }> {
    const deleted = await this.templates.remove(user.organizationId, catalogId, templateId);
    if (!deleted) throw new AppException('NOT_FOUND', 404, { resource: 'import_template' });
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'import.template_deleted',
      entityType: 'import_mapping_template',
      entityId: templateId,
      before: { catalogId },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return { id: templateId, deleted: true };
  }

  private parseExplicitMapping(value: unknown): ColumnMapping | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    let candidate: unknown = value;
    if (typeof value === 'string') {
      try {
        candidate = JSON.parse(value);
      } catch {
        throw new AppException('VALIDATION_FAILED', 400, {
          fieldErrors: { mapping: ['El mapeo debe ser un JSON válido.'] },
        });
      }
    }
    const parsed = columnMappingSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AppException('VALIDATION_FAILED', 400, parsed.error.flatten());
    }
    return parsed.data;
  }

  private parseFile(buffer: Buffer, extension: ImportFileExtension, delimiter?: string) {
    let parsed: ReturnType<typeof parseImportFile>;
    try {
      parsed = parseImportFile(buffer, extension, delimiter);
    } catch (error) {
      if (error instanceof ImportParseError) {
        if (error.reason === 'empty_file') {
          throw apiException('EMPTY_IMPORT', 400, undefined, error.message);
        }
        throw apiException('INVALID_IMPORT_FILE', 400, undefined, error.message);
      }
      throw error;
    }
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      throw apiException(
        'EMPTY_IMPORT',
        400,
        { headers: parsed.headers.length, rows: parsed.rows.length },
        'El archivo no tiene filas de datos.',
      );
    }
    return parsed;
  }

  /** Agente (B): mock determinista o deepseek; una reintento y luego null. */
  private async tryAgent(
    headers: string[],
    columns: ReturnType<typeof inferColumns>,
    rows: Array<Record<string, unknown>>,
    heuristic: ReturnType<typeof buildHeuristicProposal>,
  ): Promise<MappingProposal | null> {
    try {
      const provider = this.aiFactory.createProvider();
      if (provider.name === 'mock') {
        return this.buildMockAgentProposal(headers, heuristic);
      }

      const system =
        'Sos un analista de datos de catálogos. Devolvés SOLO JSON válido, sin markdown, con las claves mapping, extraFields, ignoredColumns, warnings, explanation y confidence.';
      const user = this.buildAgentPrompt(headers, columns, rows);
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      let completion = await this.complete(provider, messages);
      let candidate = parseAgentProposal(completion.text, headers);
      if (!candidate) {
        this.logger.warn({ headers }, 'import_agent_invalid_json_retry');
        messages.push({
          role: 'user',
          content:
            'Tu respuesta anterior no fue JSON válido o no mapeó ninguna columna. Devolvé SOLO el objeto JSON pedido, sin explicaciones fuera del JSON.',
        });
        completion = await this.complete(provider, messages);
        candidate = parseAgentProposal(completion.text, headers);
      }
      if (!candidate) return null;
      return this.mergeAgentWithHeuristic(candidate, heuristic, completion);
    } catch (error) {
      this.logger.warn({ err: error }, 'import_agent_unavailable_fallback');
      return null;
    }
  }

  private async complete(
    provider: ReturnType<AiProviderFactory['createProvider']>,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
  ): Promise<AiCompletionResult> {
    return provider.complete({
      model: this.aiFactory.modelName(provider),
      messages,
      maxOutputTokens: AGENT_MAX_TOKENS,
      temperature: 0.1,
    });
  }

  private buildAgentPrompt(
    headers: string[],
    columns: ReturnType<typeof inferColumns>,
    rows: Array<Record<string, unknown>>,
  ): string {
    return [
      `Encabezados: ${JSON.stringify(headers)}`,
      `Tipos inferidos: ${JSON.stringify(
        columns.map((column) => ({
          header: column.header,
          type: column.type,
          samples: column.samples,
          emptyRatio: column.emptyRatio,
        })),
      )}`,
      `Primeras filas: ${JSON.stringify(
        rows
          .slice(0, 5)
          .map((row) =>
            Object.fromEntries(headers.map((header) => [header, String(row[header] ?? '')])),
          ),
      )}`,
      'Campos estándar disponibles: sku, name, description, category, brand, price, cost, stock, image.',
      'Para las columnas que no sean campos estándar proponé extraFields con key en snake_case (solo [a-z0-9_]), label legible y type (TEXT, NUMBER, CURRENCY, DATE, BOOLEAN, URL, IMAGE, ENUM, UNKNOWN).',
      'Ignorá columnas de totales, subtotales, IVA o notas justificando el motivo en ignoredColumns.',
    ].join('\n');
  }

  private buildMockAgentProposal(
    headers: string[],
    heuristic: ReturnType<typeof buildHeuristicProposal>,
  ): MappingProposal {
    const payload = JSON.stringify({
      mapping: heuristic.mapping,
      extraFields: heuristic.extraFields,
      ignoredColumns: heuristic.ignoredColumns,
      warnings: heuristic.warnings,
      explanation: `${heuristic.explanation} (propuesta simulada por el proveedor mock)`,
      confidence: heuristic.confidence,
    });
    const candidate = parseAgentProposal(payload, headers);
    if (!candidate) {
      return { ...heuristic, agent: null };
    }
    return {
      ...candidate,
      headersSignature: heuristic.headersSignature,
      agent: {
        provider: 'mock',
        model: 'mock-import-v1',
        tokensIn: 240,
        tokensOut: 160,
        mocked: true,
      },
    };
  }

  /** Re-valida la propuesta del agente contra la heurística determinista. */
  private mergeAgentWithHeuristic(
    candidate: AgentProposalCandidate,
    heuristic: ReturnType<typeof buildHeuristicProposal>,
    completion: AiCompletionResult,
  ): MappingProposal {
    const mapping: ColumnMapping = { ...candidate.mapping };
    const usedColumns = new Set(Object.values(mapping).filter(Boolean));
    for (const field of ['sku', 'name', 'price'] as const) {
      if (!mapping[field] && heuristic.mapping[field]) {
        const header = heuristic.mapping[field]!;
        if (!usedColumns.has(header)) {
          mapping[field] = header;
          usedColumns.add(header);
        }
      }
    }
    // El agente puede omitir `cost` aunque exista la columna: la heurística la
    // conserva (y puede ser la misma columna que `price` en hojas de pedido).
    if (!mapping.cost && heuristic.mapping.cost) {
      mapping.cost = heuristic.mapping.cost;
    }
    const extraFields = candidate.extraFields.filter((field) => !usedColumns.has(field.column));
    const warnings = [...candidate.warnings];
    if (
      mapping.price &&
      mapping.price === mapping.cost &&
      !warnings.some((warning) => warning.includes('costo como precio'))
    ) {
      warnings.push('No se detectó precio; se usó la columna de costo como precio de venta.');
    }
    const missing = (['sku', 'name', 'price'] as const).filter((field) => !mapping[field]);
    if (missing.length > 0) {
      warnings.push(`El agente no mapeó: ${missing.join(', ')}.`);
    }
    return {
      mapping,
      extraFields,
      ignoredColumns: candidate.ignoredColumns,
      warnings,
      explanation: candidate.explanation,
      confidence: candidate.confidence,
      headersSignature: heuristic.headersSignature,
      agent: {
        provider: completion.provider,
        model: completion.model,
        tokensIn: completion.usage.tokensIn,
        tokensOut: completion.usage.tokensOut,
        mocked: false,
      },
    };
  }
}
