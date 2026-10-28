export interface ParsedSocialPost {
  title: string;
  body: string;
  hashtags: string[];
  cta: string;
  visualSuggestion: string | null;
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_]{2,40}/gu) ?? [];
  return [...new Set(matches)].slice(0, 8);
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^[#>*\-\s]+/, '')
    .replace(/\*\*/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Parser tolerante del output del modelo: intenta JSON (aunque venga con
 * markdown o texto alrededor) y, si falla, arma el post desde texto plano.
 */
export function parseSocialPostText(text: string): ParsedSocialPost {
  const cleaned = stripCodeFence(text);

  for (const candidate of [cleaned, extractJsonObject(cleaned)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const title = toStringValue(parsed.title);
      const body = toStringValue(parsed.body);
      if (title && body) {
        return {
          title: title.slice(0, 160),
          body: body.slice(0, 3000),
          hashtags: stringArray(parsed.hashtags)
            .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
            .slice(0, 8),
          cta: toStringValue(parsed.cta) || 'Escribinos para coordinar tu compra.',
          visualSuggestion: toStringValue(parsed.visualSuggestion) || null,
        };
      }
    } catch {
      // Sigue con el fallback de texto.
    }
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => stripMarkdown(line))
    .filter((line) => line.length > 0);
  const title = (lines[0] ?? 'Contenido para redes sociales').slice(0, 160);
  const body = lines.slice(1).join('\n').slice(0, 3000) || title;
  const lastLine = lines.at(-1) ?? '';
  const cta =
    lastLine.length > 0 && lastLine.length <= 140
      ? lastLine
      : 'Escribinos para coordinar tu compra.';

  return {
    title,
    body,
    hashtags: extractHashtags(cleaned),
    cta,
    visualSuggestion: null,
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
