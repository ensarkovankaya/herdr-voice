export function sanitizeForSpeech(text) {
  return (text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]{1,3}/g, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shorten(text, maxLen = 240) {
  const t = text || '';
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

export function heuristicSummarize(text, { maxLen = 240 } = {}) {
  return shorten(sanitizeForSpeech(text), maxLen);
}
