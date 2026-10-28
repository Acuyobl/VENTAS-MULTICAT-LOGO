export interface MockSvgInput {
  title: string;
  cta: string;
  productName: string | null;
  productPrice: string | null;
  visualSuggestion?: string | null;
  brand?: string;
}

/** Escapa texto para que el SVG siempre sea XML válido. */
export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * SVG 1080×1080 determinista (sin azar, sin red) para el proveedor de imagen
 * mock: degradado de marca, título, producto/precio, CTA y marca.
 */
export function buildMockSocialSvg(input: MockSvgInput): string {
  const brand = input.brand ?? 'VentasCatálogo';
  const titleLines = wrap(input.title, 24, 3);
  const titleStartY = 300;
  const titleNodes = titleLines
    .map(
      (line, index) =>
        `<text x="90" y="${titleStartY + index * 86}" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#fbf8f1">${escapeXml(line)}</text>`,
    )
    .join('\n    ');
  const product = input.productName
    ? `<text x="90" y="640" font-family="Arial, sans-serif" font-size="38" fill="#cfe3d6">${escapeXml(input.productName)}</text>`
    : '';
  const price = input.productPrice
    ? `<text x="90" y="730" font-family="Georgia, serif" font-size="64" font-weight="700" fill="#f6d58b">${escapeXml(input.productPrice)}</text>`
    : '';
  const suggestion = input.visualSuggestion
    ? wrap(input.visualSuggestion, 54, 2)
        .map(
          (line, index) =>
            `<text x="90" y="${index === 0 ? 900 : 948}" font-family="Arial, sans-serif" font-size="26" fill="#9fbfae">${escapeXml(line)}</text>`,
        )
        .join('\n    ')
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="${escapeXml(input.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2e22"/>
      <stop offset="55%" stop-color="#1f513a"/>
      <stop offset="100%" stop-color="#3c7f5c"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f6d58b"/>
      <stop offset="100%" stop-color="#e8b65a"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="240" fill="#fbf8f1" opacity="0.05"/>
  <circle cx="90" cy="1010" r="300" fill="#fbf8f1" opacity="0.04"/>
  <rect x="90" y="120" width="120" height="8" rx="4" fill="url(#accent)"/>
  <text x="90" y="180" font-family="Arial, sans-serif" font-size="26" letter-spacing="6" fill="#cfe3d6">${escapeXml(brand.toUpperCase())}</text>
    ${titleNodes}
  ${product}
  ${price}
  <text x="90" y="840" font-family="Arial, sans-serif" font-size="34" fill="#fbf8f1">${escapeXml(input.cta)}</text>
  ${suggestion}
  <text x="90" y="1010" font-family="Arial, sans-serif" font-size="22" letter-spacing="3" fill="#9fbfae">${escapeXml(brand)} · Costa Rica</text>
</svg>`;
}
