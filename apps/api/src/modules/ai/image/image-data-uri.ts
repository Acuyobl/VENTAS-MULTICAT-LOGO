/** Detecta el MIME de una imagen por magic bytes (SVG por texto). */
export function detectImageContentType(buffer: Buffer): string {
  if (buffer.length >= 8) {
    if (
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  const head = buffer.subarray(0, 12).toString('latin1');
  if (head.startsWith('GIF8')) return 'image/gif';
  if (head.startsWith('RIFF') && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  const text = buffer.subarray(0, 512).toString('utf8').trimStart();
  if (text.startsWith('<svg') || text.startsWith('<?xml')) return 'image/svg+xml';
  return 'image/jpeg';
}

/** `data:<mime>;base64,<contenido>` para incrustar la foto en un SVG. */
export function toDataUri(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

/** Hash determinista simple (FNV-1a) para variar el diseño por publicación. */
export function stableVariant(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash);
}
