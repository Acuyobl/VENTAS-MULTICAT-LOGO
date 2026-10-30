import JSZip from 'jszip';
import { Logger } from '@nestjs/common';

const logger = new Logger('XlsxImages');
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export interface SheetImage {
  dataUri: string;
  mime: string;
  /** Fila absoluta del XLSX (0-based, igual que openpyxl: C2 → row 1). */
  row: number;
  col: number;
}

/** `Map<nombreHoja, Map<fila0based, imágenes ancladas>>`. */
export type SheetImages = Map<string, Map<number, SheetImage[]>>;

function parseXmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attrs[match[1] ?? ''] = match[2] ?? '';
  }
  return attrs;
}

function parseRelationships(xml: string): Map<string, string> {
  const relationships = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const attrs = parseXmlAttributes(match[0]);
    const id = attrs.Id ?? attrs['r:id'];
    const target = attrs.Target;
    if (id && target) relationships.set(id, target);
  }
  return relationships;
}

/** Resuelve `../drawings/x.xml` contra `xl/worksheets/sheet1.xml`. */
function resolveZipPath(baseFile: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const baseParts = baseFile.split('/');
  baseParts.pop();
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

function relationshipsPath(file: string): string {
  const parts = file.split('/');
  const name = parts.pop() ?? '';
  return [...parts, '_rels', `${name}.rels`].join('/');
}

export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function readAnchors(drawingXml: string): Array<{ row: number; col: number; embed: string }> {
  const anchors: Array<{ row: number; col: number; embed: string }> = [];
  // Excel suele usar prefijo `xdr:`; openpyxl escribe los tags sin prefijo.
  for (const match of drawingXml.matchAll(
    /<(?:xdr:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/(?:xdr:)?\1>/g,
  )) {
    const body = match[2] ?? '';
    const from = /<(?:xdr:)?from>([\s\S]*?)<\/(?:xdr:)?from>/.exec(body)?.[1] ?? '';
    const row = Number(/<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/.exec(from)?.[1] ?? '-1');
    const col = Number(/<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>/.exec(from)?.[1] ?? '-1');
    const embed = /(?:\br:)?embed="([^"]+)"/.exec(body)?.[1];
    if (row >= 0 && col >= 0 && embed) anchors.push({ row, col, embed });
  }
  return anchors;
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  try {
    return await file.async('string');
  } catch {
    return null;
  }
}

/**
 * Extrae las imágenes **incrustadas** de un XLSX leyendo el zip directamente
 * (`workbook.xml` + rels → worksheets → drawings → media). Nunca lanza: un
 * archivo sin dibujos, .xls antiguo o zip corrupto devuelve un mapa vacío.
 */
export async function extractXlsxImages(buffer: Buffer): Promise<SheetImages> {
  const result: SheetImages = new Map();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    logger.debug('xlsx_zip_invalido');
    return result;
  }

  try {
    const workbookXml = await readText(zip, 'xl/workbook.xml');
    if (!workbookXml) return result;
    const workbookRelsXml = await readText(zip, 'xl/_rels/workbook.xml.rels');
    const workbookRels = workbookRelsXml ? parseRelationships(workbookRelsXml) : new Map();

    const mediaCache = new Map<string, SheetImage | null>();
    const sheets: Array<{ name: string; relId: string }> = [];
    for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
      const attrs = parseXmlAttributes(match[0]);
      const name = attrs.name;
      const relId = attrs['r:id'];
      if (name && relId) sheets.push({ name, relId });
    }

    for (const sheet of sheets) {
      const sheetPath = workbookRels.get(sheet.relId);
      if (!sheetPath) continue;
      const normalizedSheetPath = resolveZipPath('xl/workbook.xml', sheetPath);
      const sheetRelsXml = await readText(zip, relationshipsPath(normalizedSheetPath));
      if (!sheetRelsXml) continue;
      const sheetRels = parseRelationships(sheetRelsXml);
      const drawingPath = [...sheetRels.values()].find((target) => target.includes('drawing'));
      if (!drawingPath) continue;

      const normalizedDrawingPath = resolveZipPath(normalizedSheetPath, drawingPath);
      const drawingXml = await readText(zip, normalizedDrawingPath);
      if (!drawingXml) continue;
      const drawingRelsXml = await readText(zip, relationshipsPath(normalizedDrawingPath));
      const drawingRels = drawingRelsXml ? parseRelationships(drawingRelsXml) : new Map();

      const rows = new Map<number, SheetImage[]>();
      for (const anchor of readAnchors(drawingXml)) {
        const mediaTarget = drawingRels.get(anchor.embed);
        if (!mediaTarget) continue;
        const mediaPath = resolveZipPath(normalizedDrawingPath, mediaTarget);
        if (!mediaCache.has(mediaPath)) {
          const mediaFile = zip.file(mediaPath);
          if (!mediaFile) {
            mediaCache.set(mediaPath, null);
          } else {
            try {
              const bytes = Buffer.from(await mediaFile.async('nodebuffer'));
              const mime = detectImageMime(bytes);
              mediaCache.set(
                mediaPath,
                mime && bytes.length > 0 && bytes.length <= MAX_MEDIA_BYTES
                  ? {
                      dataUri: `data:${mime};base64,${bytes.toString('base64')}`,
                      mime,
                      row: anchor.row,
                      col: anchor.col,
                    }
                  : null,
              );
            } catch {
              mediaCache.set(mediaPath, null);
            }
          }
        }
        const media = mediaCache.get(mediaPath);
        if (!media) continue;
        const list = rows.get(anchor.row) ?? [];
        list.push({ ...media, row: anchor.row, col: anchor.col });
        rows.set(anchor.row, list);
      }
      if (rows.size > 0) result.set(sheet.name, rows);
    }
  } catch {
    logger.debug('xlsx_imagenes_error');
  }
  return result;
}

/** Columna de imágenes según la cabecera (`Imagen`, `Foto`, `Image`). */
export function findImageColumnIndex(headerRow: readonly unknown[]): number {
  return headerRow.findIndex((cell) => {
    const normalized = String(cell ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    return normalized === 'imagen' || normalized === 'foto' || normalized === 'image';
  });
}

/** Nombre de hoja con tabla de imágenes (`Imagenes`, `Fotos`, `Images`). */
export function findImageSheet(images: SheetImages): string | null {
  return [...images.keys()].find((name) => /imagen|foto|image/i.test(name)) ?? null;
}
