import type { ImageDesignKey } from '@ventascatalogo/contracts';

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
  /** Diseño visual configurable por organización. */
  design?: ImageDesignKey;
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

const BRAND = 'VentasCatálogo';

function svgOpen(input: MockSvgInput, design: ImageDesignKey): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="${escapeXml(
    input.title,
  )}" data-design="${design}" data-photo="${input.photoDataUri ? 'true' : 'false'}" data-variant="${
    Math.abs(input.variant ?? 0) % 97
  }">`;
}

function defs(accent: readonly [string, string]): string {
  return `<defs>
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
  </defs>`;
}

/** CLASICA: foto a sangre, overlay oscuro, datos abajo y marca arriba a la derecha. */
export function buildClassicSvg(input: MockSvgInput): string {
  const brand = input.brand ?? BRAND;
  const accent = ACCENTS[Math.abs(input.variant ?? 0) % ACCENTS.length];
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

  return `${svgOpen(input, 'CLASICA')}
  ${defs(accent)}
  ${background}
  <rect x="90" y="120" width="120" height="8" rx="4" fill="url(#accent)"/>
  <text x="990" y="180" text-anchor="end" font-family="Arial, sans-serif" font-size="26" letter-spacing="6" fill="#cfe3d6">${escapeXml(brand.toUpperCase())}</text>
    ${titleNodes}
  ${product}
  ${price}
  <text x="90" y="880" font-family="Arial, sans-serif" font-size="34" fill="#fbf8f1">${escapeXml(input.cta)}</text>
  ${suggestion}
  <text x="90" y="1010" font-family="Arial, sans-serif" font-size="22" letter-spacing="3" fill="#cfe3d6">${escapeXml(brand)} · Costa Rica</text>
</svg>`;
}

/** EDITORIAL: panel izquierdo crema + foto a sangre a la derecha (tipo revista). */
export function buildEditorialSvg(input: MockSvgInput): string {
  const brand = input.brand ?? BRAND;
  const titleLines = wrap(input.title, 20, 4);
  const titleNodes = titleLines
    .map(
      (line, index) =>
        `<text x="64" y="${300 + index * 76}" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#14201b">${escapeXml(line)}</text>`,
    )
    .join('\n    ');
  const product = input.productName
    ? `<text x="64" y="650" font-family="Arial, sans-serif" font-size="30" fill="#3f4a44">${escapeXml(input.productName)}</text>`
    : '';
  const price = input.productPrice
    ? `<text x="64" y="748" font-family="Georgia, serif" font-size="58" font-weight="700" fill="#1f513a">${escapeXml(input.productPrice)}</text>`
    : '';
  const cta = `<text x="64" y="836" font-family="Arial, sans-serif" font-size="26" fill="#14201b" text-decoration="underline">${escapeXml(input.cta)}</text>`;
  const rightPanel = input.photoDataUri
    ? `<image href="${escapeXml(input.photoDataUri)}" x="486" y="0" width="594" height="1080" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="486" y="0" width="594" height="1080" fill="url(#bg)"/>
  <circle cx="960" cy="240" r="210" fill="#fbf8f1" opacity="0.06"/>`;

  return `${svgOpen(input, 'EDITORIAL')}
  ${defs(ACCENTS[1])}
  <rect width="1080" height="1080" fill="#fbf8f1"/>
  ${rightPanel}
  <rect x="486" width="6" height="1080" fill="#1f513a" opacity="0.7"/>
  <text x="64" y="120" font-family="Arial, sans-serif" font-size="20" letter-spacing="5" fill="#2f6b4f">${escapeXml(
    brand.toUpperCase(),
  )}</text>
  <line x1="64" y1="150" x2="420" y2="150" stroke="#14201b" stroke-width="1.5"/>
  <text x="64" y="215" font-family="Arial, sans-serif" font-size="18" letter-spacing="4" fill="#7b827d">EDICIÓN ${String(
    (Math.abs(input.variant ?? 0) % 90) + 1,
  ).padStart(2, '0')}</text>
    ${titleNodes}
  ${product}
  <line x1="64" y1="700" x2="300" y2="700" stroke="#7b827d" stroke-width="1"/>
  ${price}
  ${cta}
  <text x="64" y="1010" font-family="Arial, sans-serif" font-size="20" letter-spacing="3" fill="#7b827d">${escapeXml(
    brand,
  )} · Costa Rica</text>
</svg>`;
}

/** PROMO: foto + overlay verde, badge circular, banda diagonal, precio enorme y píldora. */
export function buildPromoSvg(input: MockSvgInput): string {
  const brand = input.brand ?? BRAND;
  const titleLines = wrap(input.title, 26, 2);
  const titleNodes = titleLines
    .map(
      (line, index) =>
        `<text x="80" y="${300 + index * 78}" font-family="Arial, sans-serif" font-size="66" font-weight="800" fill="#fbf8f1">${escapeXml(line)}</text>`,
    )
    .join('\n    ');
  const product = input.productName
    ? `<text x="80" y="520" font-family="Arial, sans-serif" font-size="34" fill="#d8efe1">${escapeXml(input.productName)}</text>`
    : '';
  const price = input.productPrice
    ? `<text x="74" y="690" font-family="Arial, sans-serif" font-size="112" font-weight="900" fill="#ff7a59" stroke="#06140e" stroke-width="2">${escapeXml(input.productPrice)}</text>`
    : '';
  const background = input.photoDataUri
    ? `<image href="${escapeXml(input.photoDataUri)}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1080" fill="url(#promoOverlay)"/>`
    : `<rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#promoOverlay)"/>`;
  const pillWidth = Math.min(760, 40 + input.cta.length * 22);
  const band = `<g transform="rotate(-12 540 940)">
    <rect x="-120" y="900" width="1320" height="120" fill="#1f513a" opacity="0.95"/>
    <text x="80" y="985" font-family="Arial, sans-serif" font-size="44" font-weight="800" letter-spacing="6" fill="#ffd166">${escapeXml(
      input.visualSuggestion ? 'PRECIO ESPECIAL' : 'APROVECHÁ HOY',
    )}</text>
  </g>`;

  return `${svgOpen(input, 'PROMO')}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2e22"/>
      <stop offset="55%" stop-color="#1f513a"/>
      <stop offset="100%" stop-color="#3c7f5c"/>
    </linearGradient>
    <linearGradient id="promoOverlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#06140e" stop-opacity="0.25"/>
      <stop offset="55%" stop-color="#06140e" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0f2e22" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff7a59"/>
      <stop offset="100%" stop-color="#ffd166"/>
    </linearGradient>
  </defs>
  ${background}
  <circle cx="880" cy="210" r="150" fill="#ff7a59"/>
  <circle cx="880" cy="210" r="138" fill="#0f2e22" opacity="0.25"/>
  <text x="880" y="196" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="#fbf8f1">OFERTA</text>
  <text x="880" y="248" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fbf8f1">%</text>
  <text x="80" y="130" font-family="Arial, sans-serif" font-size="24" letter-spacing="6" fill="#ffd166">${escapeXml(
    brand.toUpperCase(),
  )}</text>
    ${titleNodes}
  ${product}
  ${price}
  <rect x="76" y="792" width="${pillWidth}" height="92" rx="46" fill="url(#accent)"/>
  <text x="${pillWidth / 2 + 76}" y="851" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#14201b">${escapeXml(
    input.cta,
  )}</text>
  ${band}
  <text x="80" y="1050" font-family="Arial, sans-serif" font-size="20" letter-spacing="4" fill="#d8efe1">${escapeXml(
    brand,
  )} · Costa Rica</text>
</svg>`;
}

/** Dispatcher por diseño (default CLASICA). */
export function buildMockSocialSvg(input: MockSvgInput): string {
  const design = input.design ?? 'CLASICA';
  const finalInput = { ...input, design };
  if (design === 'EDITORIAL') return buildEditorialSvg(finalInput);
  if (design === 'PROMO') return buildPromoSvg(finalInput);
  return buildClassicSvg(finalInput);
}
