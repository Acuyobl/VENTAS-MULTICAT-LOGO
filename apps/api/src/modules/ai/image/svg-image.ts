export interface MockSvgInput {
  title: string;
  cta: string;
  productName: string | null;
  productPrice: string | null;
  visualSuggestion?: string | null;
  brand?: string;
  /** `data:image/...;base64,...` de la foto del producto (fondo a sangre). */
  photoDataUri?: string | null;
  /** Entero determinista para variar acentos/overlay por publicación. */
  variant?: number;
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

const ACCENTS = [
  ['#f6d58b', '#e8b65a'],
  ['#f7c6a3', '#e89b6a'],
  ['#bfe3d0', '#7fc6a5'],
] as const;

/**
 * SVG 1080×1080 determinista para el mock. Si hay foto del producto, la usa de
 * fondo a sangre + overlay oscuro para legibilidad; si no, cae al degradado de
 * marca. El `variant` cambia acentos/overlay para que dos publicaciones no sean
 * idénticas.
 */
export function buildMockSocialSvg(input: MockSvgInput): string {
  const brand = input.brand ?? 'VentasCatálogo';
  const variant = Math.abs(input.variant ?? 0);
  const accent = ACCENTS[variant % ACCENTS.length];
  const titleLines = wrap(input.title, 24, 3);
  const titleStartY = input.photoDataUri ? 360 : 300;
  const titleNodes = titleLines
    .map(
      (line, index) =>
        `<text x="90" y="${titleStartY + index * 86}" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#fbf8f1">${escapeXml(line)}</text>`,
    )
    .join('\n    ');
  const product = input.productName
    ? `<text x="90" y="700" font-family="Arial, sans-serif" font-size="40" fill="#e8f2ea">${escapeXml(input.productName)}</text>`
    : '';
  const price = input.productPrice
    ? `<text x="90" y="790" font-family="Georgia, serif" font-size="64" font-weight="700" fill="${accent[0]}">${escapeXml(input.productPrice)}</text>`
    : '';
  const suggestion = input.visualSuggestion
    ? wrap(input.visualSuggestion, 54, 2)
        .map(
          (line, index) =>
            `<text x="90" y="${index === 0 ? 930 : 972}" font-family="Arial, sans-serif" font-size="26" fill="#cfe3d6">${escapeXml(line)}</text>`,
        )
        .join('\n    ')
    : '';

  const background = input.photoDataUri
    ? `<image href="${escapeXml(input.photoDataUri)}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1080" fill="url(#overlay)"/>`
    : `<rect width="1080" height="1080" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="240" fill="#fbf8f1" opacity="0.05"/>
  <circle cx="90" cy="1010" r="300" fill="#fbf8f1" opacity="0.04"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="${escapeXml(input.title)}" data-variant="${variant % 97}" data-photo="${input.photoDataUri ? 'true' : 'false'}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2e22"/>
      <stop offset="55%" stop-color="#1f513a"/>
      <stop offset="100%" stop-color="#3c7f5c"/>
    </linearGradient>
    <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#06140e" stop-opacity="0.15"/>
      <stop offset="45%" stop-color="#06140e" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#06140e" stop-opacity="0.86"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent[0]}"/>
      <stop offset="100%" stop-color="${accent[1]}"/>
    </linearGradient>
  </defs>
  ${background}
  <rect x="90" y="120" width="120" height="8" rx="4" fill="url(#accent)"/>
  <text x="90" y="180" font-family="Arial, sans-serif" font-size="26" letter-spacing="6" fill="#cfe3d6">${escapeXml(brand.toUpperCase())}</text>
    ${titleNodes}
  ${product}
  ${price}
  <text x="90" y="880" font-family="Arial, sans-serif" font-size="34" fill="#fbf8f1">${escapeXml(input.cta)}</text>
  ${suggestion}
  <text x="90" y="1010" font-family="Arial, sans-serif" font-size="22" letter-spacing="3" fill="#cfe3d6">${escapeXml(brand)} · Costa Rica</text>
</svg>`;
}
