import http from 'node:http';

// POST a JSON body to urlStr with the voice token header; resolves
// {status, body}. Destroys the request (rejects) after timeoutMs.
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

// Collect a request body and JSON.parse it. Rejects past `limit` bytes or on
// invalid JSON; an empty body resolves to {}.
export function readJsonBody(req, { limit = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let buf = ''; let size = 0; let done = false;
    const fail = (e) => { if (done) return; done = true; req.destroy(); reject(e); };
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) return fail(new Error('payload too large'));
      buf += c;
    });
    req.on('end', () => {
      if (done) return; done = true;
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
    req.on('error', (e) => fail(e));
  });
}

// Write a JSON response with the given status code.
export function sendJson(res, status, obj) {
  const data = JSON.stringify(obj ?? {});
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(data);
}
