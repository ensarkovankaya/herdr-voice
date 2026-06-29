import { spawn as realSpawn } from 'node:child_process';

// Summarizer that pipes the text through an external command (e.g. `claude -p`).
// `${text}` in args is substituted, and the text is also written to stdin when
// cfg.stdin. Resolves trimmed stdout; rejects on spawn error, empty output, or
// timeout (the child is killed).
export function makeCommandSummarizer({ spawn = realSpawn } = {}) {
  return function commandSummarize(text, cfg) {
    const c = cfg.summarize.command || {};
    const args = (c.args || []).map((a) => a.replace(/\$\{text\}/g, text));
    return new Promise((resolve, reject) => {
      let out = ''; let done = false; let child;
      const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
      const timer = setTimeout(() => { try { child && child.kill(); } catch { /* ignore */ } finish(reject, new Error('timeout')); }, c.timeoutMs || 8000);
      try { child = spawn(c.cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] }); }
      catch (e) { return finish(reject, e); }
      child.stdout.on('data', (d) => { out += d; });
      child.on('error', (e) => finish(reject, e));
      child.on('close', () => { const t = out.trim(); t ? finish(resolve, t) : finish(reject, new Error('empty')); });
      if (c.stdin) { try { child.stdin.write(text); child.stdin.end(); } catch { /* ignore */ } }
    });
  };
}
