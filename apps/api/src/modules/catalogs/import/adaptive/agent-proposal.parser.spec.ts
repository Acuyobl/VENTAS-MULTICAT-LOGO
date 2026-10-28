import { describe, expect, it } from 'vitest';
import { parseAgentProposal } from './agent-proposal.parser';

const headers = ['Código', 'Artículo', 'Precio final ₡', 'Medida', 'Total'];

describe('parseAgentProposal', () => {
  it('parsea JSON válido y normaliza columnas', () => {
    const proposal = parseAgentProposal(
      JSON.stringify({
        mapping: { sku: 'codigo', name: 'Artículo', price: 'Precio final ₡', brand: 'NoExiste' },
        extraFields: [
          { column: 'Medida', key: 'medida', label: 'Medida', type: 'TEXT' },
          { column: 'Total', key: 'total', label: 'Total', type: 'CURRENCY' },
        ],
        ignoredColumns: [{ column: 'Total', reason: 'Es un total calculado.' }],
        warnings: ['Revisá el stock'],
        explanation: 'Propuesta del agente',
        confidence: 0.91,
      }),
      headers,
    );

    expect(proposal).not.toBeNull();
    expect(proposal!.mapping).toEqual({
      sku: 'Código',
      name: 'Artículo',
      price: 'Precio final ₡',
    });
    expect(proposal!.extraFields.map((field) => field.column)).toEqual(['Medida']);
    expect(proposal!.ignoredColumns).toEqual([
      { column: 'Total', reason: 'Es un total calculado.' },
    ]);
    expect(proposal!.confidence).toBe(0.91);
  });

  it('tolera bloques markdown con json', () => {
    const proposal = parseAgentProposal(
      '```json\n{"mapping":{"sku":"Código"},"extraFields":[],"ignoredColumns":[],"warnings":[],"explanation":"ok","confidence":0.5}\n```',
      headers,
    );
    expect(proposal?.mapping.sku).toBe('Código');
  });

  it('devuelve null con JSON inválido, texto o propuesta vacía', () => {
    expect(parseAgentProposal('no es json', headers)).toBeNull();
    expect(parseAgentProposal('{"mapping":"todo"}', headers)).toBeNull();
    expect(parseAgentProposal('{"mapping":{},"extraFields":[]}', headers)).toBeNull();
  });

  it('descarta columnas inexistentes y claves inválidas', () => {
    const proposal = parseAgentProposal(
      JSON.stringify({
        mapping: { sku: 'NoExiste' },
        extraFields: [{ column: 'Medida', key: 'Medida Mala', label: 'M', type: 'TEXT' }],
        ignoredColumns: [],
        warnings: [],
        explanation: 'x',
        confidence: 0.3,
      }),
      headers,
    );
    expect(proposal).toBeNull();
  });
});
