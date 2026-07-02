/**
 * ClashServer — node:http + ws transport around Game (brief item 3).
 *
 * All wall-clock lives HERE (tick interval, save interval); the sim below is
 * purely tick-driven. Tests construct with `tickMs: null` and drive `tickOnce()`
 * by hand for fully deterministic end-to-end runs.
 *
 * HTTP:  POST /api/join · GET /api/world (ETag) · GET /api/state ·
 *        POST /api/claim · /api/raise · /api/march · /api/provision · /api/choice
 * WS:    /ws?token=…  → {t:'hello'} on connect, {t:'tick'} broadcast per tick
 * Static: ./public (apps/web lands there — smoke page for now)
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { ApiError, type Game, type TickResult } from './game';

export interface ServerConfig {
  game: Game;
  /** TCP port; 0 = ephemeral (tests). */
  port: number;
  /** Wall-clock ms per world tick; null = no auto loop (tests drive tickOnce()). */
  tickMs: number | null;
  /** Snapshot save interval in ms; null = no periodic saves (still saved on stop()). */
  saveMs?: number | null;
  /** Static files dir; defaults to <package>/public. */
  publicDir?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export class ClashServer {
  readonly http: http.Server;
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<WebSocket>();
  private readonly game: Game;
  private readonly publicDir: string;
  private readonly worldBody: string;
  private readonly worldEtag: string;
  private tickTimer?: NodeJS.Timeout;
  private saveTimer?: NodeJS.Timeout;

  constructor(private readonly config: ServerConfig) {
    this.game = config.game;
    this.publicDir = config.publicDir ?? join(__dirname, '..', '..', 'public');

    // /api/world is static for the life of the world — render once, ETag it.
    // tickMs is server config (wall-clock boundary), stapled on so clients can
    // convert tick ETAs to real time.
    const geo = this.game.worldGeometry();
    this.worldBody = JSON.stringify({ ...geo, meta: { ...geo.meta, tickMs: config.tickMs } });
    this.worldEtag = `"${createHash('sha1').update(this.worldBody).digest('hex')}"`;

    this.http = http.createServer((req, res) => {
      this.route(req, res).catch((e: unknown) => {
        sendError(res, e);
      });
    });
    this.http.on('upgrade', (req, socket, head) => this.upgrade(req, socket as import('node:net').Socket, head));
  }

  /** Bind + start the tick/save loops. Resolves to the bound port. */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.config.port, () => {
        const addr = this.http.address();
        const port = typeof addr === 'object' && addr !== null ? addr.port : this.config.port;
        if (this.config.tickMs !== null) {
          this.tickTimer = setInterval(() => {
            try {
              this.tickOnce();
            } catch (e) {
              console.error('[server] tick failed:', e);
            }
          }, this.config.tickMs);
        }
        const saveMs = this.config.saveMs === undefined ? 30_000 : this.config.saveMs;
        if (saveMs !== null) {
          this.saveTimer = setInterval(() => {
            try {
              this.game.saveToDisk();
            } catch (e) {
              console.error('[server] snapshot save failed:', e);
            }
          }, saveMs);
          this.saveTimer.unref();
        }
        resolve(port);
      });
    });
  }

  /** Advance one world tick and broadcast the delta to every WS client. */
  tickOnce(): TickResult {
    const result = this.game.tick();
    const msg = JSON.stringify({ t: 'tick', tick: result.tick, events: result.events, deltas: result.deltas });
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
    return result;
  }

  /** Stop loops, snapshot to disk, close sockets + server. */
  async stop(): Promise<void> {
    if (this.tickTimer !== undefined) clearInterval(this.tickTimer);
    if (this.saveTimer !== undefined) clearInterval(this.saveTimer);
    try {
      this.game.saveToDisk();
    } catch (e) {
      console.error('[server] final snapshot failed:', e);
    }
    for (const ws of this.clients) ws.terminate();
    this.clients.clear();
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      this.http.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // ── WS ─────────────────────────────────────────────────────────────────────

  private upgrade(req: http.IncomingMessage, socket: import('node:net').Socket, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const session = this.game.sessionByToken(url.searchParams.get('token') ?? undefined);
    if (session === undefined) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
      ws.send(JSON.stringify({ t: 'hello', tick: this.game.state.world.tick, playerId: session.playerId }));
    });
  }

  // ── HTTP routing ───────────────────────────────────────────────────────────

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/api/join' && method === 'POST') {
      const body = await readJsonBody(req);
      const { playerId, token, governorId, officers } = this.game.join(body.name);
      sendJson(res, 200, { playerId, token, governorId, officers });
      return;
    }
    if (path === '/api/world' && method === 'GET') {
      if (req.headers['if-none-match'] === this.worldEtag) {
        res.writeHead(304, { etag: this.worldEtag });
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        etag: this.worldEtag,
        'cache-control': 'public, max-age=60',
      });
      res.end(this.worldBody);
      return;
    }
    if (path === '/api/state' && method === 'GET') {
      const session = this.game.sessionByToken(bearerToken(req));
      const state = this.game.publicState();
      sendJson(res, 200, session === undefined ? state : { ...state, my: this.game.myState(session.governorId) });
      return;
    }
    if (path.startsWith('/api/') && method === 'POST') {
      const session = this.game.requireSession(bearerToken(req));
      const body = await readJsonBody(req);
      switch (path) {
        case '/api/claim':
          sendJson(res, 200, { territory: this.game.claim(session.governorId, body.territoryId) });
          return;
        case '/api/raise':
          sendJson(res, 200, this.game.raise(session.governorId, body.territoryId, body.preset, body.heroId));
          return;
        case '/api/march':
          sendJson(res, 200, this.game.march(session.governorId, body.armyId, body.toTerritoryId));
          return;
        case '/api/provision':
          sendJson(res, 200, this.game.provision(session.governorId, body.armyId, body.food, body.gold, body.wood));
          return;
        case '/api/choice':
          sendJson(res, 200, this.game.choice(session.governorId, body.battleId, body.action));
          return;
        default:
          throw new ApiError(404, 'UNKNOWN_ENDPOINT', `no such endpoint ${path}`);
      }
    }
    if (path.startsWith('/api/')) throw new ApiError(404, 'UNKNOWN_ENDPOINT', `no such endpoint ${method} ${path}`);

    if (method === 'GET') {
      await this.serveStatic(path, res);
      return;
    }
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', `${method} not allowed`);
  }

  private async serveStatic(path: string, res: http.ServerResponse): Promise<void> {
    const rel = path === '/' ? 'index.html' : path.slice(1);
    const full = normalize(join(this.publicDir, rel));
    if (!full.startsWith(normalize(this.publicDir))) throw new ApiError(403, 'FORBIDDEN', 'path traversal');
    try {
      const data = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      throw new ApiError(404, 'NOT_FOUND', `no such file ${path}`);
    }
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function bearerToken(req: http.IncomingMessage): string | undefined {
  const h = req.headers.authorization;
  if (h === undefined || !h.startsWith('Bearer ')) return undefined;
  return h.slice('Bearer '.length).trim();
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new ApiError(413, 'BODY_TOO_LARGE', 'request body exceeds 64 KiB');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('body must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    throw new ApiError(400, 'BAD_JSON', e instanceof Error ? e.message : 'invalid JSON body');
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res: http.ServerResponse, e: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (e instanceof ApiError) {
    sendJson(res, e.status, { error: { code: e.code, message: e.message } });
    return;
  }
  console.error('[server] internal error:', e);
  sendJson(res, 500, { error: { code: 'INTERNAL', message: 'internal server error' } });
}
