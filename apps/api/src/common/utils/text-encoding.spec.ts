import { describe, expect, it } from 'vitest';
import { AppException } from '../errors/app-exception';
import {
  assertValidEncoding,
  containsReplacementChar,
  findInvalidEncodingPath,
} from './text-encoding';

describe('containsReplacementChar', () => {
  it('detecta U+FFFD', () => {
    expect(containsReplacementChar('Mar\uFFFDa')).toBe(true);
    expect(containsReplacementChar('María')).toBe(false);
    expect(containsReplacementChar(123)).toBe(false);
    expect(containsReplacementChar(null)).toBe(false);
  });
});

describe('findInvalidEncodingPath', () => {
  it('devuelve el path del primer string corrupto', () => {
    expect(findInvalidEncodingPath({ name: 'María' })).toBeNull();
    expect(findInvalidEncodingPath({ customer: { fullName: 'Mar\uFFFDa' } })).toBe(
      'customer.fullName',
    );
    expect(findInvalidEncodingPath({ items: [{ name: 'ok' }, { name: 'Ferreter\uFFFDa' }] })).toBe(
      'items[1].name',
    );
    expect(findInvalidEncodingPath({ name: '\uFFFD' }, 'body')).toBe('body.name');
  });
});

describe('assertValidEncoding', () => {
  it('lanza 422 VALIDATION_FAILED con reason y path', () => {
    const error = (() => {
      try {
        assertValidEncoding({ customer: { fullName: 'Mar\uFFFDa' } });
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('VALIDATION_FAILED');
    expect((error as AppException).getStatus()).toBe(422);
    expect((error as AppException).getResponse()).toMatchObject({
      statusCode: 422,
      details: { reason: 'invalid_encoding', path: 'customer.fullName' },
    });
  });

  it('no lanza con texto válido', () => {
    expect(() => assertValidEncoding({ name: 'María', nested: [{ x: 'café' }] })).not.toThrow();
  });
});
