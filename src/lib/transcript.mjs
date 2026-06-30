// Walk the JSONL transcript backwards and return the most recent assistant
// message's text (joining its text blocks); '' if none is found.
export function extractLastAssistantText(jsonl) {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const msg = o && typeof o.message === 'object' && o.message ? o.message : o;
    const isAssistant = o.type === 'assistant' || (msg && msg.role === 'assistant');
    if (!isAssistant) continue;
    const content = msg.content;
    if (typeof content === 'string') { if (content.trim()) return content.trim(); continue; }
    if (Array.isArray(content)) {
      const texts = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text);
      if (texts.length) return texts.join('\n').trim();
    }
  }
  return '';
}

// Walk the JSONL transcript backwards and return the most recent session title
// (Claude's auto-generated `ai-title` line); '' if none is present.
export function extractSessionTitle(jsonl) {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o && o.type === 'ai-title' && typeof o.aiTitle === 'string' && o.aiTitle.trim()) {
      return o.aiTitle.trim();
    }
  }
  return '';
}

// Parse the transcript region appended at/after `fromChars` (a character
// offset, not a byte offset — it must match how the writer measures length;
// the transcript is append-only, so the offset is stable) and render new
// user+assistant text turns as compact "role: text" lines. Used to feed the
// rolling recap only the turns since the last recap. Malformed/partial lines
// are skipped.
export function extractNewTurns(jsonl, fromChars = 0) {
  const slice = (jsonl || '').slice(Math.max(0, fromChars || 0));
  const out = [];
  for (const raw of slice.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const msg = o && typeof o.message === 'object' && o.message ? o.message : o;
    const role = (o.type === 'assistant' || (msg && msg.role === 'assistant')) ? 'assistant'
      : (o.type === 'user' || (msg && msg.role === 'user')) ? 'user' : null;
    if (!role) continue;
    const content = msg.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
    }
    text = text.trim();
    if (text) out.push(`${role}: ${text}`);
  }
  return out.join('\n');
}
