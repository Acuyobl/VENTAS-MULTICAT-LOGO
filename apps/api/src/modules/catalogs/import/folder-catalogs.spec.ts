import { describe, expect, it } from 'vitest';
import {
  construirManifestImagenes,
  esDocumentoEstructurado,
  esImagen,
  nombreDesdeArchivo,
  slugSku,
} from './folder-catalogs';

describe('folder-catalogs', () => {
  it('detecta imágenes y documentos', () => {
    expect(esImagen('foto.JPEG')).toBe(true);
    expect(esImagen('catalogo.xlsx')).toBe(false);
    expect(esDocumentoEstructurado('precios.pdf')).toBe(true);
    expect(esDocumentoEstructurado('lista.csv')).toBe(true);
    expect(esDocumentoEstructurado('foto.jpg')).toBe(false);
  });

  it('genera un manifiesto CSV con una fila por imagen', () => {
    const csv = construirManifestImagenes('ADIDAS', [
      { nombre: 'zapatilla-1.jpg', url: 'https://drive.example/1' },
      { nombre: 'WhatsApp Image 2026-11-04.jpeg', url: 'https://drive.example/2' },
    ]);
    const lineas = csv.trim().split('\n');
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe('sku,nombre,precio,categoria,imagen');
    expect(lineas[1]).toContain('"ADIDAS-001"');
    expect(lineas[1]).toContain('"zapatilla-1"');
    expect(lineas[1]).toContain('1.00');
    expect(lineas[1]).toContain('"ADIDAS"');
    expect(lineas[1]).toContain('https://drive.example/1');
    // Nombre genérico de WhatsApp → Producto N
    expect(lineas[2]).toContain('"Producto 2"');
  });

  it('escapa comillas y comas en los campos', () => {
    const csv = construirManifestImagenes('Marca "X", S.A.', [
      { nombre: 'foto, especial.jpg', url: 'https://drive.example/a,b' },
    ]);
    expect(csv).toContain('"Marca ""X"", S.A."');
    expect(csv).toContain('"foto, especial"');
  });

  it('normaliza SKU y nombres', () => {
    expect(slugSku('Niños / Calzado')).toBe('NINOS-CALZADO');
    expect(slugSku('   ')).toBe('ITEM');
    expect(nombreDesdeArchivo('123.jpg', 0)).toBe('Producto 1');
  });
});
