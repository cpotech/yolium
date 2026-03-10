/**
 * Normalize raw inline SVG blocks to markdown images with base64 data URIs.
 *
 * Agents (especially OpenCode and Codex) may output raw `<svg>...</svg>` in comments.
 * react-markdown's `skipHtml={true}` default strips these. This function converts
 * raw SVG blocks into `![SVG](data:image/svg+xml;base64,...)` so the existing
 * secure img rendering path handles them.
 */

const SVG_REGEX = /<svg[\s>][\s\S]*?<\/svg>/gi;
const ALREADY_ENCODED = /!\[.*?\]\(data:image\/svg\+xml;base64,/;

export function normalizeSvgToDataUri(text: string): string {
  if (!text.includes('<svg') && !text.includes('<SVG')) return text;
  if (ALREADY_ENCODED.test(text) && !SVG_REGEX.test(text)) return text;

  // Reset lastIndex since we use the global flag
  SVG_REGEX.lastIndex = 0;

  return text.replace(SVG_REGEX, (match) => {
    const b64 = Buffer.from(match).toString('base64');
    return `![SVG](data:image/svg+xml;base64,${b64})`;
  });
}
