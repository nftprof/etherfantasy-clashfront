/**
 * Network layer: JSON API + reconnecting WebSocket (backoff, status callback).
 * Errors surface as Error objects carrying `.code` from the {error:{code,message}} envelope.
 */

export async function api(path, { token, body, method } = {}) {
  const res = await fetch(path, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `HTTP ${res.status}`);
    err.code = json?.error?.code ?? 'HTTP_' + res.status;
    throw err;
  }
  return json;
}

/**
 * Open /ws?token=… and keep it open. handlers: onMessage(msg), onStatus('ok'|'connecting'|'down'),
 * onReconnect() — fired after every re-established connection (caller refetches /api/state).
 */
export function connectWS(token, handlers) {
  let ws;
  let closed = false;
  let attempts = 0;
  let everOpened = false;

  const open = () => {
    if (closed) return;
    handlers.onStatus(attempts === 0 ? 'connecting' : 'down');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      const isReconnect = everOpened;
      everOpened = true;
      attempts = 0;
      handlers.onStatus('ok');
      if (isReconnect) handlers.onReconnect();
    };
    ws.onmessage = (e) => {
      try { handlers.onMessage(JSON.parse(e.data)); } catch (err) { console.error('[ws] bad message', err); }
    };
    ws.onclose = () => {
      if (closed) return;
      handlers.onStatus('down');
      const delay = Math.min(10_000, 1000 * Math.pow(1.7, attempts++));
      setTimeout(open, delay);
    };
    ws.onerror = () => { /* onclose follows */ };
  };
  open();
  return { close() { closed = true; ws?.close(); } };
}
