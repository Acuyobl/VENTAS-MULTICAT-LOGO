import { randomUUID } from 'node:crypto';
import { sha256 } from '../../../common/utils/crypto';
import { extensionForContentType, productImageKey } from '../../storage/image-utils';
import type { ImportProductRow, ImportRowIssueData } from './row-validator';
import { decodeDataUriImage, isDataUriImage } from './image-source';

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
  /** Si es true, genera una maqueta SVG del producto en MinIO si la imagen no se pudo descargar o es local. */
  generateMockupFallback?: boolean;
}

export interface ImportImageResolution {
  products: ResolvedImportProduct[];
  warnings: ImportRowIssueData[];
}

/** `https://…` / `http://…` (cualquier otro valor es una referencia relativa). */
export function isHttpImageUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/** Máximo de descargas simultáneas para no gatillar límites del origen. */
export const IMPORT_IMAGE_CONCURRENCY = 3;

/** Ejecuta `worker` con concurrencia acotada preservando el orden de `items`. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function generateProductSvgMockup(input: {
  name: string;
  category?: string | null;
  priceMinor: bigint | string | number;
  imageRef?: string | null;
}): string {
  const title = input.name || 'Producto';
  const cat = input.category || 'Catálogo';
  const priceNum = Number(input.priceMinor || 0);
  const formattedPrice =
    priceNum > 0 ? `₡${priceNum.toLocaleString('es-CR')}` : 'Consultar';

  let refTag = '';
  if (input.imageRef) {
    const match = input.imageRef.match(/pedido_(\d+)/i);
    refTag = match ? `PEDIDO #${match[1]}` : input.imageRef.slice(0, 16);
  }

  const hues = [
    { a: '#059669', b: '#10b981', glow: 'rgba(16, 185, 129, 0.35)' },
    { a: '#0284c7', b: '#38bdf8', glow: 'rgba(56, 189, 248, 0.35)' },
    { a: '#7c3aed', b: '#a855f7', glow: 'rgba(168, 85, 247, 0.35)' },
    { a: '#d97706', b: '#fbbf24', glow: 'rgba(251, 191, 36, 0.35)' },
    { a: '#e11d48', b: '#fb7185', glow: 'rgba(251, 113, 133, 0.35)' },
  ];
  const charSum = title.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pal = hues[charSum % hues.length];

  const isPolo = /polo/i.test(title) || /polo/i.test(cat);
  const isSleeveless = /basket|sin mangas/i.test(title);
  const isLongSleeve = /larga/i.test(title) || /motocross/i.test(title);

  let shirtPath = '';
  if (isSleeveless) {
    shirtPath = 'M 320,240 Q 400,280 480,240 L 510,320 L 470,360 L 470,580 L 330,580 L 330,360 L 290,320 Z';
  } else if (isLongSleeve) {
    shirtPath = 'M 300,240 Q 400,280 500,240 L 590,340 L 550,540 L 510,520 L 480,360 L 480,580 L 320,580 L 320,360 L 290,520 L 250,540 L 210,340 Z';
  } else {
    shirtPath = 'M 300,240 Q 400,270 500,240 L 570,300 L 530,370 L 470,330 L 470,580 L 330,580 L 330,330 L 270,370 L 230,300 Z';
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1324"/>
      <stop offset="50%" stop-color="#111c35"/>
      <stop offset="100%" stop-color="#070c18"/>
    </linearGradient>
    <linearGradient id="shirtGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${pal.b}"/>
      <stop offset="100%" stop-color="${pal.a}"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="${pal.glow}"/>
    </filter>
  </defs>

  <rect width="800" height="800" rx="32" fill="url(#bgGrad)"/>
  <circle cx="400" cy="380" r="280" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="2"/>
  <circle cx="400" cy="380" r="210" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5" stroke-dasharray="6 6"/>

  <g transform="translate(50, 60)">
    <rect width="${Math.max(100, cat.length * 11 + 32)}" height="34" rx="17" fill="rgba(255,255,255,0.08)"/>
    <text x="16" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#94a3b8" letter-spacing="1">${escapeXml(cat.toUpperCase())}</text>
  </g>

  ${refTag ? `
  <g transform="translate(580, 60)">
    <rect width="170" height="34" rx="17" fill="${pal.a}" opacity="0.9"/>
    <text x="85" y="23" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" fill="#ffffff" letter-spacing="1">${escapeXml(refTag)}</text>
  </g>` : ''}

  <g filter="url(#glow)">
    <path d="${shirtPath}" fill="url(#shirtGrad)" opacity="0.95"/>
    <path d="M 370,245 Q 400,270 430,245" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.4"/>
    ${isPolo ? '<path d="M 400,265 L 400,320" stroke="#ffffff" stroke-width="4" opacity="0.4"/>' : ''}
    <line x1="330" y1="560" x2="470" y2="560" stroke="#ffffff" stroke-width="3" opacity="0.3"/>
  </g>

  <rect x="40" y="620" width="720" height="136" rx="24" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="70" y="668" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#f8fafc">
    ${escapeXml(title.slice(0, 36))}
  </text>
  <text x="70" y="700" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#94a3b8">
    Prenda personalizada de alta calidad
  </text>

  <g transform="translate(540, 650)">
    <rect width="180" height="60" rx="16" fill="${pal.b}"/>
    <text x="90" y="38" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="900" fill="#0b1324">
      ${escapeXml(formattedPrice)}
    </text>
  </g>
</svg>`;
}

/**
 * Resuelve la columna `imagen` de las filas válidas de una importación.
 *
 * - URL `http(s)` o data URI: descarga/decodifica, valida, sube a MinIO y guarda la key.
 * - Archivo local / referencia de pedido (ej. `pedido_378_...jpeg`): genera una maqueta
 *   SVG del producto optimizada y estilizada y la sube a MinIO.
 * - Producto sin imagen: genera la maqueta visual del producto para que el catálogo
 *   siempre muestre imágenes completas en la tienda y backoffice.
 */
export async function resolveImportImages(
  products: readonly ImportProductRow[],
  deps: ImportImageDeps,
): Promise<ImportImageResolution> {
  const warnings: ImportRowIssueData[] = [];

  const resolved = await mapWithConcurrency(products, IMPORT_IMAGE_CONCURRENCY, async (product) => {
    const { imageRef, rawData, ...rest } = product;
    const productId = randomUUID();
    let imageKey: string | null = null;

    if (imageRef) {
      if (isHttpImageUrl(imageRef) || isDataUriImage(imageRef)) {
        try {
          const { buffer, contentType } = isDataUriImage(imageRef)
            ? decodeDataUriImage(imageRef)
            : await deps.download(imageRef);
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
            message: `No se pudo descargar la imagen remota "${imageRef}": ${
              error instanceof Error ? error.message : 'error desconocido'
            }`,
            rawData,
          });
        }
      } else {
        warnings.push({
          rowNumber: product.rowNumber,
          severity: 'warning',
          code: 'IMAGE_UNRESOLVED',
          message: `Referencia de imagen relativa no accesible desde el servidor: "${imageRef}". Subí la imagen manualmente o proveé una URL https://.`,
          rawData,
        });
      }
    }

    // Si no hubo descarga remota y se solicitó maqueta visual (fallback activo),
    // creamos la maqueta visual SVG en MinIO para que el producto siempre tenga imagen visible
    if (!imageKey && deps.generateMockupFallback) {
      try {
        const svgContent = generateProductSvgMockup({
          name: product.name,
          category: product.category,
          priceMinor: product.priceMinor,
          imageRef: imageRef ?? null,
        });
        const buffer = Buffer.from(svgContent, 'utf-8');
        const key = productImageKey({
          catalogId: deps.catalogId,
          catalogVersionId: deps.catalogVersionId,
          productId,
          checksum: sha256(buffer),
          ext: 'svg',
        });
        await deps.upload(key, buffer, 'image/svg+xml');
        imageKey = key;
      } catch {
        // Fallback silencioso
      }
    }

    return { ...rest, id: productId, imageKey };
  });

  warnings.sort((a, b) => a.rowNumber - b.rowNumber);
  return { products: resolved, warnings };
}
