// Replace ${var} tokens from `vars`, falling back to process.env, else ''.
function interpolate(str, vars) {
  return str.replace(/\$\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : (process.env[k] ?? '')));
}
// Read a dotted path (e.g. "choices.0.message.content") out of a nested object.
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
// Recursively interpolate ${var} tokens through a JSON body template.
function fillBody(body, vars) {
  if (typeof body === 'string') return interpolate(body, vars);
  if (Array.isArray(body)) return body.map((b) => fillBody(b, vars));
  if (body && typeof body === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(body)) out[k] = fillBody(v, vars);
    return out;
  }
  return body;
}

// Summarizer that calls an HTTP LLM endpoint described entirely by config
// (url/method/headers and prompt/body/response templates). Aborts after
// timeoutMs and throws on non-2xx, empty, or non-string result so the caller
// can fall back to the heuristic.
export function makeLlmSummarizer({ fetchImpl = globalThis.fetch } = {}) {
  return async function llmSummarize(text, cfg) {
    const c = cfg.summarize.llm || {};
    const prompt = interpolate(c.promptTemplate || '${text}', { text });
    const headers = { 'content-type': 'application/json' };
    for (const [k, v] of Object.entries(c.headers || {})) headers[k] = interpolate(v, {});
    const body = fillBody(c.bodyTemplate || { text: '${text}' }, { text, prompt });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), c.timeoutMs || 4000);
    try {
      const res = await fetchImpl(c.url, { method: c.method || 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const out = c.responsePath ? getPath(json, c.responsePath) : json;
      if (typeof out !== 'string' || !out.trim()) throw new Error('empty result');
      return out;
    } finally { clearTimeout(timer); }
  };
}
