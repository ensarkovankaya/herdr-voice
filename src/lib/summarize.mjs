export function summarize(text, { maxLen = 240, fallback = 'Done.' } = {}) {
  if (!text || typeof text !== 'string') return fallback;
  let t = text
    .replace(/```[\s\S]*?```/g, ' ')              // fenced code
    .replace(/`[^`]*`/g, ' ')                      // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')         // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // links -> text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // heading/list/quote
    .replace(/[*_~`]{1,3}/g, '')                   // emphasis markers
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ')       // regional indicators (flags)
    .replace(/\p{Extended_Pictographic}/gu, ' ')   // emoji pictographs
    .replace(/[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '') // variation selectors, ZWJ, keycap
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return fallback;
  if (t.length <= maxLen) return t;
  const parts = t.split(/(?<=[.!?…])\s+/);
  let out = '';
  for (const p of parts) {
    if (!out) out = p;
    else if ((out + ' ' + p).length <= maxLen) out += ' ' + p;
    else break;
  }
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + '…';
  return out;
}
