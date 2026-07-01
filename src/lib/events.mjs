// Events fanned out to SSE clients by the streaming logger. `speak` is NOT here:
// it is broadcast directly with the full ring-buffer entry (richer than a log line).
export const STREAM_EVENTS = new Set([
  'toggle', 'tts_fallback', 'tts_spoke', 'register', 'deregister',
  'presence_register', 'presence_deregister',
]);

// Holds open SSE responses and pushes text/event-stream frames to them.
export function makeEventHub() {
  const clients = new Set();
  return {
    add(res) { clients.add(res); },
    remove(res) { clients.delete(res); },
    size() { return clients.size; },
    broadcast(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
      for (const res of clients) {
        try { res.write(frame); } catch { clients.delete(res); }
      }
    },
  };
}

// Wrap a base logger so whitelisted events are also broadcast (with a timestamp).
export function makeStreamingLog(base, hub, stream = STREAM_EVENTS) {
  return function log(level, event, fields = {}) {
    base(level, event, fields);
    if (stream.has(event)) hub.broadcast(event, { ts: new Date().toISOString(), ...fields });
  };
}
