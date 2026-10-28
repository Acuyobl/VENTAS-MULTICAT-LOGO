import { randomUUID } from 'node:crypto';
import { sha256 } from '../../../common/utils/crypto';
import { extensionForContentType, productImageKey } from '../../storage/image-utils';
import type { ImportProductRow, ImportRowIssueData } from './row-validator';

/** Producto ya validado, con id asignado y su imagen resuelta a una key de MinIO (o null). */
export interface ResolvedImportProduct extends Omit<ImportProductRow, 'imageRef' | 'rawData'> {
  /** Id generado antes de persistir: la key de la imagen lo necesita en su ruta. */
  id: string;
  imageKey: string | null;
}

export interface ImportImageDeps {
  catalogId: string;
  catalogVersionId: string;
  /** Descarga con timeout/tamaño/tipo validados (ver `downloadImage`). */
  download: (url: string) => Promise<{ buffer: Buffer; contentType: string }>;
  /** Sube al bucket privado de productos. */
  upload: (key: string, buffer: Buffer, contentType: string) => Promise<void>;
}

export interface ImportImageResolution {
  products: ResolvedImportProduct[];
  warnings: ImportRowIssueData[];
}

/** `https://…` / `http://…` (cualquier otro valor es una referencia relativa). */
export function isHttpImageUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/**
 * Resuelve la columna `imagen` de las filas válidas de una importación.
 *
 * - URL `http(s)`: descarga, valida, sube a MinIO y guarda la key.
 * - URL que falla (red, HTTP, tipo, tamaño, subida): warning
 *   `IMAGE_DOWNLOAD_FAILED`; el producto igual se importa, sin imagen.
 * - Valor relativo/quebrado: warning `IMAGE_UNRESOLVED`, sin key inválida.
 *
 * Las advertencias **no** bloquean la fila ni cuentan como cuarentena.
 */
export async function resolveImportImages(
  products: readonly ImportProductRow[],
  deps: ImportImageDeps,
): Promise<ImportImageResolution> {
  const warnings: ImportRowIssueData[] = [];
  const resolved: ResolvedImportProduct[] = [];

  for (const product of products) {
    const { imageRef, rawData, ...rest } = product;
    const productId = randomUUID();
    let imageKey: string | null = null;

    if (imageRef && isHttpImageUrl(imageRef)) {
      try {
        const { buffer, contentType } = await deps.download(imageRef);
        const ext = extensionForContentType(contentType);
        if (!ext) throw new Error(`content_type_no_soportado:${contentType}`);

        const key = productImageKey({
          catalogId: deps.catalogId,
          catalogVersionId: deps.catalogVersionId,
          productId,
          checksum: sha256(buffer),
          ext,
        });
        await deps.upload(key, buffer, contentType);
        imageKey = key;
      } catch (error) {
        warnings.push({
          rowNumber: product.rowNumber,
          severity: 'warning',
          code: 'IMAGE_DOWNLOAD_FAILED',
          message: `No se pudo guardar la imagen "${imageRef}": ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
          rawData,
        });
      }
    } else if (imageRef) {
      warnings.push({
        rowNumber: product.rowNumber,
        severity: 'warning',
        code: 'IMAGE_UNRESOLVED',
        message: `La imagen "${imageRef}" no es una URL http(s); se importó sin imagen.`,
        rawData,
      });
    }

    resolved.push({ ...rest, id: productId, imageKey });
  }

  return { products: resolved, warnings };
}
