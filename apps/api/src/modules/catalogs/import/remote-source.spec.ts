import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RemoteImportError,
  assertPublicUrl,
  downloadRemoteFile,
  driveDownloadUrl,
  driveFileId,
  driveFolderId,
  fileNameFromDisposition,
  listDriveFolder,
  maxRemoteBytes,
  resolveRemoteLink,
} from './remote-source';

const HTML_CARPETA = `
<div class="flip-entry" id="entry-aaa111">
  <a href="https://drive.google.com/drive/folders/bbb222">
    <div class="flip-entry-title">ADIDAS</div>
  </a>
</div>
<div class="flip-entry" id="entry-ccc333">
  <a href="https://drive.google.com/file/d/ccc333/view">
    <div class="flip-entry-title">catalogo.xlsx</div>
  </a>
</div>
<div class="flip-entry" id="entry-ddd444">
  <a href="https://drive.google.com/file/d/ddd444/view">
    <div class="flip-entry-title">foto.png</div>
  </a>
</div>
`;

function respuesta(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote-source: detección de links', () => {
  it('extrae el id de un link de archivo de Drive', () => {
    expect(driveFileId('https://drive.google.com/file/d/abc123XYZ_-/view?usp=sharing')).toBe('abc123XYZ_-');
    expect(driveFileId('https://drive.google.com/open?id=abc123XYZ_-')).toBe('abc123XYZ_-');
  });

  it('no confunde una carpeta con un archivo', () => {
    const carpeta = 'https://drive.google.com/drive/folders/1oWZlZtqsS4Lk3Typy_lmdKnvpxF63-Y-';
    expect(driveFolderId(carpeta)).toBe('1oWZlZtqsS4Lk3Typy_lmdKnvpxF63-Y-');
    expect(driveFileId(carpeta)).toBeNull();
  });

  it('arma la URL de descarga directa de Drive', () => {
    expect(driveDownloadUrl('abc')).toContain('id=abc');
    expect(driveDownloadUrl('abc')).toContain('export=download');
  });

  it('lee nombres con UTF-8 del Content-Disposition', () => {
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''cat%C3%A1logo.xlsx")).toBe(
      'catálogo.xlsx',
    );
    expect(fileNameFromDisposition('attachment; filename="lista.csv"')).toBe('lista.csv');
    expect(fileNameFromDisposition(null)).toBeNull();
  });
});

describe('remote-source: seguridad', () => {
  it('rechaza hosts locales o privados', () => {
    for (const url of [
      'http://localhost:3000/x.csv',
      'http://127.0.0.1/x.csv',
      'http://10.0.0.5/x.csv',
      'http://192.168.1.10/x.csv',
      'http://169.254.169.254/latest/meta-data',
      'http://mi-servidor.local/x.csv',
    ]) {
      expect(() => assertPublicUrl(url)).toThrow(RemoteImportError);
    }
  });

  it('rechaza protocolos que no son http(s)', () => {
    expect(() => assertPublicUrl('ftp://example.com/x.csv')).toThrow();
    expect(() => assertPublicUrl('file:///c:/x.csv')).toThrow();
  });

  it('acepta un host público', () => {
    expect(assertPublicUrl('https://example.com/catalogo.csv').hostname).toBe('example.com');
  });
});

describe('remote-source: carpetas de Drive', () => {
  it('lista archivos y subcarpetas de una carpeta pública', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(HTML_CARPETA)));
    const entradas = await listDriveFolder('1oWZlZtqsS4Lk3Typy_lmdKnvpxF63-Y-');
    expect(entradas).toHaveLength(3);
    expect(entradas[0]).toMatchObject({ name: 'ADIDAS', kind: 'folder' });
    expect(entradas[1]).toMatchObject({ name: 'catalogo.xlsx', kind: 'file', extension: 'xlsx' });
    expect(entradas[1].url).toContain('export=download');
    expect(entradas[2]).toMatchObject({ name: 'foto.png', kind: 'file', extension: 'png' });
  });

  it('avisa cuando la carpeta no es pública o está vacía', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta('<html>login</html>')));
    await expect(listDriveFolder('x')).rejects.toThrow(/vacía o no es pública/);
  });

  it('resuelve un link de archivo como entrada descargable', async () => {
    const listado = await resolveRemoteLink('https://drive.google.com/file/d/abc123XYZ_-/view');
    expect(listado.kind).toBe('file');
    expect(listado.entries[0].url).toContain('id=abc123XYZ_-');
  });
});

describe('remote-source: descarga', () => {
  it('devuelve nombre y contenido del archivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respuesta('sku,nombre\n1,Remera', {
          status: 200,
          headers: {
            'content-type': 'text/csv',
            'content-disposition': "attachment; filename*=UTF-8''catalogo.csv",
          },
        }),
      ),
    );
    const archivo = await downloadRemoteFile('https://example.com/descargar');
    expect(archivo.originalname).toBe('catalogo.csv');
    expect(archivo.buffer.toString()).toContain('Remera');
  });

  it('infiere la extensión desde el content-type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respuesta('x', {
          headers: { 'content-type': 'application/pdf' },
        }),
      ),
    );
    const archivo = await downloadRemoteFile('https://example.com/ver');
    expect(archivo.originalname.endsWith('.pdf')).toBe(true);
  });

  it('rechaza un HTML que no es archivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respuesta('<html></html>', { headers: { 'content-type': 'text/html' } }),
      ),
    );
    await expect(downloadRemoteFile('https://example.com/pagina')).rejects.toThrow(/página web/);
  });

  it('rechaza archivos que superan el máximo configurado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respuesta('x', {
          headers: {
            'content-type': 'text/csv',
            'content-length': String(maxRemoteBytes() + 1024 * 1024),
          },
        }),
      ),
    );
    await expect(downloadRemoteFile('https://example.com/grande.csv')).rejects.toThrow(/MB/);
  });
});
