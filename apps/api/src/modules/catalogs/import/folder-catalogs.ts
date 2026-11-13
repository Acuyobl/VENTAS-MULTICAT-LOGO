/**
 * Utilidades para convertir una carpeta de Drive en un catálogo.
 *
 * Las carpetas de marcas suelen contener **solo fotos** (JPEG/PNG/WebP). El
 * importador necesita filas con SKU/nombre/precio, así que se genera un CSV
 * manifiesto: una fila por imagen, con precio provisional (1.00) y la marca como
 * categoría. Después el usuario ajusta nombres y precios en el panel.
 */

export const IMAGENES = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const PLANILLAS = new Set(['xlsx', 'xls', 'ods', 'csv', 'tsv', 'json', 'txt']);
export const DOCUMENTOS = new Set(['pdf']);

export function extensionDe(nombre: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(nombre.trim());
  return match ? match[1].toLowerCase() : '';
}

export function esImagen(nombre: string): boolean {
  return IMAGENES.has(extensionDe(nombre));
}

export function esPlanilla(nombre: string): boolean {
  return PLANILLAS.has(extensionDe(nombre));
}

export function esDocumentoEstructurado(nombre: string): boolean {
  return esPlanilla(nombre) || DOCUMENTOS.has(extensionDe(nombre));
}

/** Slug corto y estable para los SKU generados. */
export function slugSku(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 16)
      .toUpperCase() || 'ITEM'
  );
}

/** Nombre legible a partir del archivo; descarta nombres genéricos de WhatsApp. */
export function nombreDesdeArchivo(nombre: string, indice: number): string {
  const base = nombre.replace(/\.[^/.]+$/, '').trim();
  if (
    base.length < 3 ||
    /^whatsapp image/i.test(base) ||
    /^img[_-]?\d+$/i.test(base) ||
    /^\d+$/.test(base)
  ) {
    return `Producto ${indice + 1}`;
  }
  return base.slice(0, 120);
}

function celda(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export interface ImagenDeCarpeta {
  nombre: string;
  url: string;
}

/**
 * CSV manifiesto para importar una carpeta de imágenes como productos.
 * Columnas: `sku,nombre,precio,categoria,imagen`.
 */
export function construirManifestImagenes(
  nombreCatalogo: string,
  imagenes: ImagenDeCarpeta[],
  opciones: { prefijo?: string; precio?: string } = {},
): string {
  const prefijo = slugSku(opciones.prefijo ?? nombreCatalogo);
  const precio = opciones.precio ?? '1.00';
  const categoria = nombreCatalogo.trim() || 'General';
  const filas = imagenes.map((imagen, indice) => {
    const sku = `${prefijo}-${String(indice + 1).padStart(3, '0')}`;
    return [
      celda(sku),
      celda(nombreDesdeArchivo(imagen.nombre, indice)),
      precio,
      celda(categoria),
      celda(imagen.url),
    ].join(',');
  });
  return ['sku,nombre,precio,categoria,imagen', ...filas].join('\n') + '\n';
}

/** Estructura mínima de un archivo tipo Multer (para reutilizar el importador). */
export interface ArchivoImportable {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export function comoArchivoMulter(archivo: ArchivoImportable): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: archivo.originalname,
    encoding: '7bit',
    mimetype: archivo.mimetype,
    size: archivo.buffer.byteLength,
    buffer: archivo.buffer,
    destination: '',
    filename: archivo.originalname,
    path: '',
    stream: undefined,
  } as unknown as Express.Multer.File;
}
