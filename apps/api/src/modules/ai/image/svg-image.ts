import type { ImageDesignKey } from '@ventascatalogo/contracts';

type SvgPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP' | 'LINKEDIN';
type SvgTone = 'CERCANO' | 'PROFESIONAL' | 'DIVERTIDO' | 'PREMIUM';
type SvgGoal = 'VENTAS' | 'LANZAMIENTO' | 'RECORDATORIO' | 'EDUCATIVO';

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
  platform?: SvgPlatform;
  tone?: SvgTone;
  goal?: SvgGoal;
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

interface TonePalette {
  accentA: string;
  accentB: string;
  overlayTop: string;
  overlayMid: string;
  overlayBottom: string;
  panel: string;
  ink: string;
  pillText: string;
}

const TONE_PALETTES: Record<SvgTone, TonePalette> = {
  CERCANO: {
    accentA: '#f6d58b',
    accentB: '#e8b65a',
    overlayTop: '#06140e',
    overlayMid: '#3b2a17',
    overlayBottom: '#1c120a',
    panel: '#fbf8f1',
    ink: '#14201b',
    pillText: '#14201b',
  },
  PROFESIONAL: {
    accentA: '#7fc6a5',
    accentB: '#2f6b4f',
    overlayTop: '#06140e',
    overlayMid: '#123c33',
    overlayBottom: '#071f1a',
    panel: '#eef4f1',
    ink: '#10241d',
    pillText: '#071f1a',
  },
  DIVERTIDO: {
    accentA: '#ffd166',
    accentB: '#ff7a59',
    overlayTop: '#2b0f18',
    overlayMid: '#5c1f2a',
    overlayBottom: '#1c0a10',
    panel: '#fff3d6',
    ink: '#2b0f18',
    pillText: '#2b0f18',
  },
  PREMIUM: {
    accentA: '#e6c26a',
    accentB: '#c9a13b',
    overlayTop: '#050505',
    overlayMid: '#1c1a14',
    overlayBottom: '#020202',
    panel: '#f4efe4',
    ink: '#111111',
    pillText: '#111111',
  },
};

const PLATFORM_COLORS: Record<SvgPlatform, { bg: string; fg: string }> = {
  INSTAGRAM: { bg: '#e1306c', fg: '#ffffff' },
  FACEBOOK: { bg: '#1877f2', fg: '#ffffff' },
  TIKTOK: { bg: '#111111', fg: '#25f4ee' },
  WHATSAPP: { bg: '#25d366', fg: '#062e1b' },
  LINKEDIN: { bg: '#0a66c2', fg: '#ffffff' },
};

const GOAL_BADGE: Record<SvgGoal, string> = {
  VENTAS: 'OFERTA',
  LANZAMIENTO: 'NUEVO',
  RECORDATORIO: 'ÚLTIMOS DÍAS',
  EDUCATIVO: 'APRENDÉ',
};

const BRAND = 'VentasCatálogo';

function normalizePlatform(value: string | undefined): SvgPlatform {
  const upper = (value ?? '').toUpperCase();
  return (Object.keys(PLATFORM_COLORS) as SvgPlatform[]).includes(upper as SvgPlatform)
    ? (upper as SvgPlatform)
    : 'INSTAGRAM';
}

function normalizeTone(value: string | undefined): SvgTone {
  const upper = (value ?? '').toUpperCase();
  return (Object.keys(TONE_PALETTES) as SvgTone[]).includes(upper as SvgTone)
    ? (upper as SvgTone)
    : 'CERCANO';
}

function normalizeGoal(value: string | undefined): SvgGoal {
  const upper = (value ?? '').toUpperCase();
  return (Object.keys(GOAL_BADGE) as SvgGoal[]).includes(upper as SvgGoal)
    ? (upper as SvgGoal)
    : 'VENTAS';
}

function svgOpen(input: MockSvgInput, design: ImageDesignKey): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="${escapeXml(
    input.title,
  )}" data-design="${design}" data-photo="${input.photoDataUri ? 'true' : 'false'}" data-platform="${normalizePlatform(
    input.platform,
  )}" data-tone="${normalizeTone(input.tone)}" data-goal="${normalizeGoal(input.goal)}" data-variant="${
    Math.abs(input.variant ?? 0) % 9973
  }">`;
}

function defs(palette: TonePalette): string {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f2e22"/>
      <stop offset="55%" stop-color="#1f513a"/>
      <stop offset="100%" stop-color="#3c7f5c"/>
    </linearGradient>
    <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${palette.overlayTop}" stop-opacity="0.15"/>
      <stop offset="45%" stop-color="${palette.overlayMid}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${palette.overlayBottom}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${palette.accentA}"/>
      <stop offset="100%" stop-color="${palette.accentB}"/>
    </linearGradient>
  </defs>`;
}

function platformBadge(platform: SvgPlatform, x: number, y: number): string {
  const colors = PLATFORM_COLORS[platform];
  return `<g>
    <rect x="${x}" y="${y - 22}" width="${platform.length * 15 + 36}" height="34" rx="17" fill="${colors.bg}" opacity="0.95"/>
    <text x="${x + 18}" y="${y + 2}" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="${colors.fg}">${platform}</text>
  </g>`;
}

function goalBadge(goal: SvgGoal, x: number, y: number, palette: TonePalette): string {
  const label = GOAL_BADGE[goal];
  const width = Math.max(120, label.length * 12 + 36);
  return `<g>
    <rect x="${x}" y="${y - 22}" width="${width}" height="34" rx="8" fill="url(#accent)"/>
    <text x="${x + width / 2}" y="${y + 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2" fill="${palette.pillText}">${escapeXml(label)}</text>
  </g>`;
}

/** CLASICA: foto a sangre, overlay del tono, datos abajo, insignias y marca arriba. */
export function buildClassicSvg(input: MockSvgInput): string {
  const brand = input.brand ?? BRAND;
  const tone = normalizeTone(input.tone);
  const palette = TONE_PALETTES[tone];
  const platform = normalizePlatform(input.platform);
  const goal = normalizeGoal(input.goal);
  const titleLines = wrap(input.title, 24, 3);
  const titleStartY = input.photoDataUri ? 380 : 320;
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
    ? `<text x="90" y="790" font-family="Georgia, serif" font-size="64" font-weight="700" fill="${palette.accentA}">${escapeXml(input.productPrice)}</text>`
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
  <rect width="1080" height="1080" fill="url(#overlay)" opacity="0.35"/>
  <circle cx="980" cy="120" r="240" fill="#fbf8f1" opacity="0.05"/>`;

  return `${svgOpen(input, 'CLASICA')}
  ${defs(palette)}
  ${background}
  ${platformBadge(platform, 90, 100)}
  ${goalBadge(goal, 90, 160, palette)}
  <rect x="90" y="205" width="120" height="8" rx="4" fill="url(#accent)"/>
  <text x="990" y="180" text-anchor="end" font-family="Arial, sans-serif" font-size="26" letter-spacing="6" fill="#cfe3d6">${escapeXml(brand.toUpperCase())}</text>
    ${titleNodes}
  ${product}
  ${price}
  <text x="90" y="880" font-family="Arial, sans-serif" font-size="34" fill="#fbf8f1">${escapeXml(input.cta)}</text>
  ${suggestion}
  <text x="90" y="1010" font-family="Arial, sans-serif" font-size="22" letter-spacing="3" fill="#cfe3d6">${escapeXml(brand)} · Costa Rica</text>
</svg>`;
}

/** EDITORIAL: panel del tono a la izquierda + foto a sangre a la derecha. */
export function buildEditorialSvg(input: MockSvgInput): string {
  const brand = input.brand ?? BRAND;
  const tone = normalizeTone(input.tone);
  const palette = TONE_PALETTES[tone];
  const platform = normalizePlatform(input.platform);
  const goal = normalizeGoal(input.goal);
  const titleLines = wrap(input.title, 20, 4);
  const titleNodes = titleLines
    .map(
      (line, index) =>
        `<text x="64" y="${330 + index * 76}" font-family="Georgia, serif" font-size="62" font-weight="700" fill="${palette.ink}">${escapeXml(line)}</text>`,
    )
    .join('\n    ');
  const product = input.productName
    ? `<text x="64" y="670" font-family="Arial, sans-serif" font-size="30" fill="#3f4a44">${escapeXml(input.productName)}</text>`
    : '';
  const price = input.productPrice
    ? `<text x="64" y="768" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${palette.accentB}">${escapeXml(input.productPrice)}</text>`
    : '';
  const cta = `<text x="64" y="846" font-family="Arial, sans-serif" font-size="26" fill="${palette.ink}" text-decoration="underline">${escapeXml(input.cta)}</text>`;
  const rightPanel = input.photoDataUri
    ? `<image href="${escapeXml(input.photoDataUri)}" x="486" y="0" width="594" height="1080" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="486" y="0" width="594" height="1080" fill="url(#bg)"/>
  <rect x="486" y="0" width="594" height="1080" fill="url(#overlay)" opacity="0.4"/>`;

  return `${svgOpen(input, 'EDITORIAL')}
  ${defs(palette)}
  <rect width="1080" height="1080" fill="${palette.panel}"/>
  ${rightPanel}
  <rect x="486" width="6" height="1080" fill="${palette.accentB}" opacity="0.7"/>
  <text x="64" y="120" font-family="Arial, sans-serif" font-size="20" letter-spacing="5" fill="${palette.accentB}">${escapeXml(
    brand.toUpperCase(),
  )}</text>
  ${platformBadge(platform, 64, 170)}
  <line x1="64" y1="205" x2="420" y2="205" stroke="${palette.ink}" stroke-width="1.5"/>
  <text x="64" y="240" font-family="Arial, sans-serif" font-size="18" letter-spacing="4" fill="#7b827d">EDICIÓN ${String(
    (Math.abs(input.variant ?? 0) % 90) + 1,
  ).padStart(2, '0')}</text>
  ${goalBadge(goal, 64, 280, palette)}
    ${titleNodes}
  ${product}
  <line x1="64" y1="710" x2="300" y2="710" stroke="#7b827d" stroke-width="1"/>
  ${price}
  ${cta}
  <text x="64" y="1010" font-family="Arial, sans-serif" font-size="20" letter-spacing="3" fill="#7b827d">${escapeXml(
    brand,
  )} · Costa Rica</text>
</svg>`;
}

/** PROMO: foto + overlay del tono, badge de objetivo, banda diagonal y píldora. */
export function buildPromoSvg(input: MockSvgInput): string {
  const brand = input.brand ?? BRAND;
  const tone = normalizeTone(input.tone);
  const palette = TONE_PALETTES[tone];
  const platform = normalizePlatform(input.platform);
  const goal = normalizeGoal(input.goal);
  const titleLines = wrap(input.title, 26, 2);
  const titleNodes = titleLines
    .map(
      (line, index) =>
        `<text x="80" y="${330 + index * 78}" font-family="Arial, sans-serif" font-size="66" font-weight="800" fill="#fbf8f1">${escapeXml(line)}</text>`,
    )
    .join('\n    ');
  const product = input.productName
    ? `<text x="80" y="540" font-family="Arial, sans-serif" font-size="34" fill="#f1e9d8">${escapeXml(input.productName)}</text>`
    : '';
  const price = input.productPrice
    ? `<text x="74" y="700" font-family="Arial, sans-serif" font-size="112" font-weight="900" fill="${palette.accentA}" stroke="#06140e" stroke-width="2">${escapeXml(input.productPrice)}</text>`
    : '';
  const background = input.photoDataUri
    ? `<image href="${escapeXml(input.photoDataUri)}" x="0" y="0" width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1080" fill="url(#overlay)"/>`
    : `<rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#overlay)"/>`;
  const pillWidth = Math.min(760, 40 + input.cta.length * 22);
  const band = `<g transform="rotate(-12 540 940)">
    <rect x="-120" y="900" width="1320" height="120" fill="${palette.accentB}" opacity="0.95"/>
    <text x="80" y="985" font-family="Arial, sans-serif" font-size="44" font-weight="800" letter-spacing="6" fill="${palette.pillText}">${escapeXml(
      GOAL_BADGE[goal],
    )}</text>
  </g>`;
  const badgeLabel = GOAL_BADGE[goal];
  const badgeWidth = Math.max(160, badgeLabel.length * 24 + 60);

  return `${svgOpen(input, 'PROMO')}
  ${defs(palette)}
  ${background}
  ${platformBadge(platform, 74, 100)}
  <g>
    <rect x="${880 - badgeWidth / 2}" y="150" width="${badgeWidth}" height="70" rx="35" fill="url(#accent)"/>
    <text x="880" y="196" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="3" fill="${palette.pillText}">${escapeXml(badgeLabel)}</text>
  </g>
  <text x="80" y="150" font-family="Arial, sans-serif" font-size="24" letter-spacing="6" fill="${palette.accentA}">${escapeXml(
    brand.toUpperCase(),
  )}</text>
    ${titleNodes}
  ${product}
  ${price}
  <rect x="76" y="792" width="${pillWidth}" height="92" rx="46" fill="url(#accent)"/>
  <text x="${pillWidth / 2 + 76}" y="851" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="${palette.pillText}">${escapeXml(
    input.cta,
  )}</text>
  ${band}
  <text x="80" y="1050" font-family="Arial, sans-serif" font-size="20" letter-spacing="4" fill="#f1e9d8">${escapeXml(
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
