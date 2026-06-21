import http from 'node:http';

export function postJson(urlStr, body, { token = '', timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = Buffer.from(JSON.stringify(body ?? {}));
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname || '/', method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': data.length,
        'x-voice-token': token,
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end(data);
  });
}

export function readJsonBody(req, { limit = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let buf = ''; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('payload too large')); }
      else buf += c;
    });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function sendJson(res, status, obj) {
  const data = JSON.stringify(obj ?? {});
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(data);
}
