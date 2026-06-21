export function summarize(text, { maxLen = 240, fallback = 'Tamamlandı.' } = {}) {
  if (!text || typeof text !== 'string') return fallback;
  let t = text
    .replace(/```[\s\S]*?```/g, ' ')              // fenced code
    .replace(/`[^`]*`/g, ' ')                      // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')         // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // links -> text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // başlık/list/quote
    .replace(/[*_~`]{1,3}/g, '')                   // emphasis markers
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
