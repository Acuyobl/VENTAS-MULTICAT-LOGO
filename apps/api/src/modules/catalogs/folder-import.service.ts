import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { AppException } from '../../common/errors/app-exception';
import type { AuditMeta } from '../../common/audit/audit.types';
import { CatalogsService } from './catalogs.service';
import { CatalogsRepository } from './catalogs.repository';
import { CatalogVersionsService } from './catalog-versions.service';
import { ImportsService } from './imports.service';
import { downloadRemoteFile, driveFolderId, resolveRemoteLink } from './import/remote-source';
import {
  comoArchivoMulter,
  construirManifestImagenes,
  esDocumentoEstructurado,
  esImagen,
} from './import/folder-catalogs';

export interface FolderImportInput {
  user: AuthenticatedUser;
  url: string;
  name?: string;
  maxImages?: number;
  /** Si viene, importa dentro de este catálogo (modo MERGE) en vez de crear uno. */
  catalogId?: string;
  meta: AuditMeta;
}

export type FolderImportResult =
  | {
      kind: 'catalog';
      name: string;
      catalogId: string;
      catalogVersionId: string | null;
      importedRows: number;
      quarantineRows: number;
      imagesTotal: number;
      imagesUsed: number;
      source: 'structured' | 'images';
      activated: boolean;
      warning?: string;
    }
  | {
      kind: 'container';
      name: string;
      folders: Array<{ name: string; url: string }>;
    }
  | { kind: 'empty'; name: string; reason: string };

const MAX_IMAGES_POR_DEFECTO = 100;

/**
 * Convierte una carpeta de Drive en un catálogo:
 *
 * - Si adentro hay una planilla/PDF, se importa con el pipeline normal.
 * - Si solo hay fotos, se genera un CSV manifiesto (1 fila = 1 producto) con
 *   precio provisional 1.00 y la marca como categoría; las imágenes se bajan de
 *   Drive y se suben a MinIO con el importador existente.
 * - Si la carpeta solo contiene subcarpetas, se devuelve `container` para que la
 *   UI las recorra (cada subcarpeta será otro catálogo).
 */
@Injectable()
export class FolderImportService {
  private readonly logger = new Logger(FolderImportService.name);

  constructor(
    private readonly imports: ImportsService,
    private readonly catalogs: CatalogsService,
    private readonly repo: CatalogsRepository,
    private readonly versions: CatalogVersionsService,
  ) {}

  /**
   * Devuelve el catálogo asociado al link de Drive. Si ese link ya se cargó
   * antes, lo reutiliza (no vuelve a descargar nada); si no, lo crea y guarda
   * el `driveFolderId` para reconocerlo la próxima vez.
   */
  async obtenerOCrearCatalogo(
    user: AuthenticatedUser,
    url: string,
    nombre: string,
    meta: AuditMeta,
  ): Promise<{ id: string; name: string; existing: boolean }> {
    const carpetaId = driveFolderId(url);
    if (carpetaId) {
      const existente = await this.repo.findCatalogByDriveFolder(user.organizationId, carpetaId);
      if (existente) {
        return { id: existente.id, name: existente.name, existing: true };
      }
    }
    const catalog = await this.crearCatalogoUnico(user, nombre, meta);
    if (carpetaId) {
      await this.repo.setDriveFolder(catalog.id, carpetaId);
    }
    return { id: catalog.id, name: catalog.name, existing: false };
  }

  async importar(input: FolderImportInput): Promise<FolderImportResult> {
    const listado = await resolveRemoteLink(input.url);
    const nombre = (input.name ?? '').trim() || 'Catálogo de carpetas';
    const archivos = listado.entries.filter((entrada) => entrada.kind === 'file');
    const carpetas = listado.entries.filter((entrada) => entrada.kind === 'folder');

    if (archivos.length === 0) {
      if (carpetas.length > 0) {
        return {
          kind: 'container',
          name: nombre,
          folders: carpetas.map((carpeta) => ({ name: carpeta.name, url: carpeta.url })),
        };
      }
      return {
        kind: 'empty',
        name: nombre,
        reason: 'La carpeta no tiene imágenes ni archivos importables.',
      };
    }

    const estructurado = archivos.find((archivo) => esDocumentoEstructurado(archivo.name));
    const imagenes = archivos.filter((archivo) => esImagen(archivo.name));
    const maxImagenes = Math.min(
      Math.max(input.maxImages ?? MAX_IMAGES_POR_DEFECTO, 1),
      300,
    );

    let catalog: { id: string; name: string };
    if (input.catalogId) {
      const existente = await this.repo.findForMember(
        input.catalogId,
        input.user.id,
        input.user.audience,
        input.user.organizationId,
      );
      if (!existente) {
        throw new AppException('CATALOG_NOT_FOUND', 404);
      }
      catalog = { id: existente.id, name: existente.name };
    } else {
      const porLink = await this.obtenerOCrearCatalogo(
        input.user,
        input.url,
        nombre,
        input.meta,
      );
      if (porLink.existing) {
        const actual = await this.repo.findForMember(
          porLink.id,
          input.user.id,
          input.user.audience,
          input.user.organizationId,
        );
        const productos =
          actual?.activeVersionId != null
            ? await this.repo.countActiveProducts(actual.activeVersionId)
            : 0;
        return {
          kind: 'catalog',
          name: porLink.name,
          catalogId: porLink.id,
          catalogVersionId: actual?.activeVersionId ?? null,
          importedRows: productos,
          quarantineRows: 0,
          imagesTotal: 0,
          imagesUsed: 0,
          source: 'images',
          activated: Boolean(actual?.activeVersionId),
          warning: 'Este catálogo ya estaba cargado: se reutilizó sin volver a descargar.',
        };
      }
      catalog = { id: porLink.id, name: porLink.name };
    }
    let archivoParaImportar: Express.Multer.File;
    let body: Record<string, unknown> = {};
    let source: 'structured' | 'images' = 'structured';

    if (estructurado) {
      const descargado = await downloadRemoteFile(estructurado.url);
      archivoParaImportar = comoArchivoMulter({
        buffer: descargado.buffer,
        originalname: input.name ? `${input.name}.${estructurado.extension ?? 'csv'}` : descargado.originalname,
        mimetype: descargado.mimetype,
      });
    } else {
      if (imagenes.length === 0) {
        return {
          kind: 'empty',
          name: nombre,
          reason: 'La carpeta no tiene archivos compatibles para importar.',
        };
      }
      source = 'images';
      const usadas = imagenes.slice(0, maxImagenes);
      const csv = construirManifestImagenes(
        nombre,
        usadas.map((imagen) => ({ nombre: imagen.name, url: imagen.url })),
      );
      archivoParaImportar = comoArchivoMulter({
        buffer: Buffer.from(csv, 'utf-8'),
        originalname: `${nombre.replace(/[^\w.-]+/g, '-') || 'catalogo'}.csv`,
        mimetype: 'text/csv',
      });
      body = {
        currency: 'CRC',
        mode: input.catalogId ? 'MERGE' : 'REPLACE',
        taxRateBp: '1300',
        taxIncluded: 'true',
        useAgent: 'false',
        mapping: JSON.stringify({
          sku: 'sku',
          name: 'nombre',
          price: 'precio',
          category: 'categoria',
          image: 'imagen',
        }),
      };
    }

    let resultados: {
      catalogVersionId: string | null;
      importedRows: number;
      quarantineRows: number;
    } = { catalogVersionId: null, importedRows: 0, quarantineRows: 0 };
    let warning: string | undefined;

    try {
      const resultado = await this.imports.importFile({
        user: input.user,
        catalogId: catalog.id,
        file: archivoParaImportar,
        body,
        meta: input.meta,
      });
      resultados = {
        catalogVersionId: resultado.catalogVersionId,
        importedRows: resultado.importedRows,
        quarantineRows: resultado.quarantineRows,
      };
    } catch (error) {
      warning = error instanceof Error ? error.message : 'No se pudo importar la carpeta.';
      this.logger.warn(`Carpeta "${nombre}" no importada: ${warning}`);
    }

    let activated = false;
    if (resultados.catalogVersionId && resultados.importedRows > 0) {
      try {
        await this.versions.activate(
          input.user,
          catalog.id,
          resultados.catalogVersionId,
          input.meta,
        );
        activated = true;
      } catch (error) {
        warning =
          error instanceof AppException
            ? `Catálogo creado, pero no se pudo publicar: ${error.message}`
            : 'Catálogo creado, pero no se pudo publicar.';
      }
    }

    return {
      kind: 'catalog',
      name: catalog.name,
      catalogId: catalog.id,
      catalogVersionId: resultados.catalogVersionId,
      importedRows: resultados.importedRows,
      quarantineRows: resultados.quarantineRows,
      imagesTotal: imagenes.length,
      imagesUsed: Math.min(imagenes.length, maxImagenes),
      source,
      activated,
      warning,
    };
  }

  /** Crea el catálogo; si el nombre ya existe agrega sufijo (2), (3)… */
  private async crearCatalogoUnico(
    user: AuthenticatedUser,
    nombre: string,
    meta: AuditMeta,
  ): Promise<{ id: string; name: string }> {
    for (let intento = 1; intento <= 6; intento += 1) {
      const candidato = intento === 1 ? nombre : `${nombre} (${intento})`;
      try {
        const catalog = await this.catalogs.create(user, { name: candidato }, meta);
        return { id: catalog.id, name: catalog.name };
      } catch (error) {
        const status = error instanceof AppException ? error.getStatus() : 0;
        if (status === 409) continue;
        throw error;
      }
    }
    throw new AppException(
      'VALIDATION_FAILED',
      409,
      { reason: 'catalog_name_exhausted' },
      `Ya existen varios catálogos llamados "${nombre}". Probá con otro nombre.`,
    );
  }
}
