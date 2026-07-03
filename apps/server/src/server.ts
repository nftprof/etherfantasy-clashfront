/**
 * ClashServer — node:http + ws transport around Game (brief item 3).
 *
 * All wall-clock lives HERE (tick interval, save interval); the sim below is
 * purely tick-driven. Tests construct with `tickMs: null` and drive `tickOnce()`
 * by hand for fully deterministic end-to-end runs.
 *
 * HTTP:  POST /api/join · GET /api/world (ETag) · GET /api/state (fog-filtered) ·
 *        GET /api/economy (public, 10 s cache) · GET /internal/economy/settlement (journal export) ·
 *        POST /api/claim · /api/raise · /api/march · /api/provision · /api/develop ·
 *        /api/enrich · /api/raze · /api/choice · /api/buy-ct (501 stub)
 * WS:    /ws?token=…  → {t:'hello'} on connect, {t:'tick'} broadcast per tick
 * Static: ./public — the overworld client (MVP item 4): vanilla ES modules +
 *         one CSS file, no build step (js/app.js entry, Canvas2D map).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { BridgeHub } from './bridge';
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
  /**
   * Shared secret for the /bridge/* telemetry-relay API (env BRIDGE_SECRET,
   * docs/briefs/TELEMETRY-RELAY.md). Undefined = bridge disabled (503).
   */
  bridgeSecret?: string;
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
  /** socket → viewing governorId (fog filtering is per governor — F1). */
  private readonly clients = new Map<WebSocket, string>();
  private readonly game: Game;
  private readonly publicDir: string;
  private readonly worldBody: string;
  private readonly worldEtag: string;
  private tickTimer?: NodeJS.Timeout;
  private saveTimer?: NodeJS.Timeout;
  private battleTimer?: NodeJS.Timeout;
  /** LIVE wild-battle spectators: battleId → sockets receiving battle_tick frames. */
  private readonly battleSubs = new Map<string, Set<WebSocket>>();
  /** /api/economy response cache (10 s wall clock — server boundary, never the sim). */
  private economyCache?: { body: string; at: number };
  /**
   * External battle relay (BattleSource 'bridge'): the MOBA engine pushes
   * telemetry to /bridge/* and pulls queued commands; battle_sub/battle_cmd
   * route here when the battleId is bridge-fed. Public for tests.
   */
  readonly bridge: BridgeHub;
  /** Bridge world events awaiting the next tick broadcast (public — everyone sees exhibitions). */
  private pendingBridgeEvents: Record<string, unknown>[] = [];

  constructor(private readonly config: ServerConfig) {
    this.game = config.game;
    this.publicDir = config.publicDir ?? join(__dirname, '..', '..', 'public');
    this.bridge = new BridgeHub({
      broadcast: (battleId, msg) => {
        const subs = this.battleSubs.get(battleId);
        if (subs === undefined) return;
        const raw = JSON.stringify(msg);
        for (const ws of subs) {
          if (ws.readyState === ws.OPEN) ws.send(raw);
        }
      },
      pushEvent: (ev) => this.pendingBridgeEvents.push(ev),
      worldTick: () => this.game.state.world.tick,
      hexOfParcel: (parcelId) => this.game.hexOfParcel(parcelId),
      findGovernorId: (ref) => this.game.findGovernorId(ref),
      simBattleRunning: (id) => {
        const b = this.game.wildBattle(id);
        return b !== undefined && b.outcome === undefined;
      },
      simBattleAttacker: (id) => this.game.wildBattle(id)?.attackerGovernorId,
      forceSimOutcome: (id, winner) => this.game.forceWildBattleOutcome(id, winner),
    });

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
          // LIVE wild-battle driver (docs/04 §7b): 4 Hz battle ticks for paced
          // battles + snapshot fan-out to subscribers. Same sim as the world
          // tick's accelerated stepping — only the pacing differs.
          this.battleTimer = setInterval(() => {
            try {
              this.battleTickOnce();
            } catch (e) {
              console.error('[server] battle tick failed:', e);
            }
          }, Math.round(1000 / this.game.battleTickHz()));
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

  /**
   * Advance one world tick and broadcast per-viewer fog-filtered deltas (F1).
   * The returned TickResult stays OMNISCIENT (server-side/test use); each WS
   * client receives events + deltas filtered by ITS governor's intel.
   */
  tickOnce(): TickResult {
    this.updateBattlePacing(); // paced battles are stepped LIVE, not fast-forwarded
    this.bridge.sweep(); // relay liveness (stale badge / auto-end) rides the world tick too
    const result = this.game.tick();
    // Bridge (exhibition) events are PUBLIC — appended after fog filtering.
    const bridgeEvents = this.pendingBridgeEvents.splice(0);
    const perGovernor = new Map<string, string>(); // governorId → serialized payload
    for (const [ws, governorId] of this.clients) {
      if (ws.readyState !== ws.OPEN) continue;
      let msg = perGovernor.get(governorId);
      if (msg === undefined) {
        msg = JSON.stringify({
          t: 'tick',
          tick: result.tick,
          events: [...this.game.eventsFor(governorId, result.events), ...bridgeEvents],
          deltas: this.game.deltasFor(governorId),
        });
        perGovernor.set(governorId, msg);
      }
      ws.send(msg);
    }
    return result;
  }

  /**
   * A battle runs at LIVE pace while anybody watches it OR its attacking
   * player is online (they can open the viewer any moment); otherwise the
   * world tick fast-forwards it (canon: acceleration is the same sim).
   */
  private battlePaced(battleId: string): boolean {
    const b = this.game.wildBattle(battleId);
    if (b === undefined) return false;
    const subs = this.battleSubs.get(battleId);
    if (subs !== undefined && [...subs].some((ws) => ws.readyState === ws.OPEN)) return true;
    for (const governorId of this.clients.values()) {
      if (governorId === b.attackerGovernorId) return true;
    }
    return false;
  }

  private updateBattlePacing(): void {
    for (const [id] of this.game.state.wildBattles ?? []) {
      // A bridge-BOUND battle is externally driven: always paced (the world
      // tick must neither fast-forward nor settle it while the relay owns it).
      this.game.setBattlePaced(id, this.bridge.isBound(id) || this.battlePaced(id));
    }
  }

  /**
   * One 4 Hz LIVE pass: step every paced battle a single battle tick and fan
   * the snapshot out to its subscribers. Battles decided here broadcast
   * battle_end immediately; the overworld settlement (casualties, pillage
   * choice, retreat) lands inside the next world tick — the deterministic
   * phase order owns all map mutation.
   */
  battleTickOnce(): void {
    this.bridge.sweep(); // relay liveness: stale badge at 30 s, auto-end at 2 min
    for (const [id, b] of this.game.state.wildBattles ?? []) {
      if (this.bridge.isBound(id)) {
        this.game.setBattlePaced(id, true); // external source owns this battle
        continue;
      }
      const paced = this.battlePaced(id);
      this.game.setBattlePaced(id, paced);
      if (!paced) continue;
      const wasDecided = b.outcome !== undefined;
      if (!wasDecided) this.game.stepBattle(id);
      const subs = this.battleSubs.get(id);
      if (subs === undefined || subs.size === 0) continue;
      const snap = this.game.battleSnapshot(id);
      if (snap === undefined) continue;
      const msg = JSON.stringify({ t: 'battle_tick', ...snap });
      for (const ws of subs) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      }
      if (b.outcome !== undefined && !wasDecided) {
        const end = JSON.stringify({ t: 'battle_end', battleId: id, outcome: b.outcome });
        for (const ws of subs) {
          if (ws.readyState === ws.OPEN) ws.send(end);
        }
      }
    }
    // Battles settle at world ticks — drop dead subscription buckets
    // (bridge-fed battles keep theirs until the hub forgets the battle).
    for (const id of [...this.battleSubs.keys()]) {
      if (this.game.wildBattle(id) === undefined && !this.bridge.has(id)) this.battleSubs.delete(id);
    }
  }

  /** Stop loops, snapshot to disk, close sockets + server. */
  async stop(): Promise<void> {
    if (this.tickTimer !== undefined) clearInterval(this.tickTimer);
    if (this.saveTimer !== undefined) clearInterval(this.saveTimer);
    if (this.battleTimer !== undefined) clearInterval(this.battleTimer);
    try {
      this.game.saveToDisk();
    } catch (e) {
      console.error('[server] final snapshot failed:', e);
    }
    for (const ws of this.clients.keys()) ws.terminate();
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
      this.clients.set(ws, session.governorId);
      const drop = (): void => {
        this.clients.delete(ws);
        for (const subs of this.battleSubs.values()) subs.delete(ws);
      };
      ws.on('close', drop);
      ws.on('error', drop);
      ws.on('message', (raw) => {
        try {
          this.onClientMessage(ws, session.governorId, JSON.parse(String(raw)) as Record<string, unknown>);
        } catch {
          /* malformed frame — ignore */
        }
      });
      ws.send(JSON.stringify({ t: 'hello', tick: this.game.state.world.tick, playerId: session.playerId }));
    });
  }

  /**
   * Client → server WS frames (LIVE wild battles):
   *   {t:'battle_sub', battleId}    subscribe (permission: participant or ACCURATE intel)
   *   {t:'battle_unsub', battleId}  unsubscribe
   *   {t:'battle_cmd', battleId, cmd:{kind:'move'|'rally',x,y} | {kind:'focus',targetId}}
   *                                 steering — attacking owner only
   * Server replies: battle_hello (static field + first snapshot), battle_tick
   * frames at 4 Hz, battle_end on decision, battle_err {code,message} on rejection.
   */
  private onClientMessage(ws: WebSocket, governorId: string, msg: Record<string, unknown>): void {
    const t = msg['t'];
    const battleId = typeof msg['battleId'] === 'string' ? msg['battleId'] : undefined;
    const fail = (code: string, message: string): void => {
      ws.send(JSON.stringify({ t: 'battle_err', battleId, code, message }));
    };
    if (t === 'battle_sub') {
      // BRIDGE source first: externally-relayed battles (exhibition or bound)
      // serve the square-arena hello + last telemetry snapshot from the hub.
      if (battleId !== undefined && this.bridge.has(battleId)) {
        if (!this.bridge.canView(battleId)) {
          fail('FORBIDDEN', 'that battle is not viewable');
          return;
        }
        let subs = this.battleSubs.get(battleId);
        if (subs === undefined) this.battleSubs.set(battleId, (subs = new Set()));
        subs.add(ws);
        ws.send(JSON.stringify({ t: 'battle_hello', ...this.bridge.battleStatic(battleId), snap: this.bridge.battleSnapshot(battleId) }));
        return;
      }
      if (battleId === undefined || this.game.wildBattle(battleId) === undefined) {
        fail('NO_BATTLE', 'that battle is not running');
        return;
      }
      if (!this.game.canViewBattle(governorId, battleId)) {
        fail('FORBIDDEN', 'you need eyes on that parcel (or an army in the fight) to watch');
        return;
      }
      let subs = this.battleSubs.get(battleId);
      if (subs === undefined) this.battleSubs.set(battleId, (subs = new Set()));
      subs.add(ws);
      this.game.setBattlePaced(battleId, true); // a watcher owns the pacing now
      ws.send(JSON.stringify({ t: 'battle_hello', ...this.game.battleStatic(battleId), snap: this.game.battleSnapshot(battleId) }));
      return;
    }
    if (t === 'battle_unsub') {
      if (battleId !== undefined) this.battleSubs.get(battleId)?.delete(ws);
      return;
    }
    if (t === 'battle_cmd') {
      try {
        if (battleId !== undefined && this.bridge.has(battleId)) {
          // Bridge battles queue steering for the external server to poll.
          this.bridge.command(governorId, battleId, msg['cmd']);
        } else {
          this.game.battleCommand(governorId, battleId, msg['cmd']);
        }
      } catch (e) {
        if (e instanceof ApiError) fail(e.code, e.message);
      }
      return;
    }
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
    if (path === '/api/economy' && method === 'GET') {
      // Public telemetry, cached 10 s (skipped when tickMs is null — tests drive ticks by hand).
      const now = Date.now();
      if (this.config.tickMs === null || this.economyCache === undefined || now - this.economyCache.at > 10_000) {
        this.economyCache = { body: JSON.stringify(this.game.economyView()), at: now };
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=10' });
      res.end(this.economyCache.body);
      return;
    }
    if (path === '/internal/economy/settlement' && method === 'GET') {
      // Settlement-journal export for the future chain-settlement worker
      // (PlayEscrow vault). /internal is a deployment boundary — do not expose
      // it on the public ingress.
      const afterSeq = Number(url.searchParams.get('afterSeq') ?? '-1');
      if (!Number.isInteger(afterSeq)) throw new ApiError(400, 'BAD_SEQ', 'afterSeq must be an integer');
      sendJson(res, 200, this.game.settlementSlice(afterSeq));
      return;
    }
    if (path === '/api/state' && method === 'GET') {
      const session = this.game.sessionByToken(bearerToken(req));
      // Fog of war (F1): the snapshot is filtered by the viewer's intel;
      // anonymous spectators get ownership/prosperity only (all-UNKNOWN).
      const state = this.game.stateFor(session?.governorId);
      // Exhibition bridge battles are public (bound ones surface via the sim).
      state.liveBattles = [...state.liveBattles, ...(this.bridge.liveSummaries() as typeof state.liveBattles)];
      sendJson(res, 200, session === undefined ? state : { ...state, my: this.game.myState(session.governorId) });
      return;
    }
    if (path.startsWith('/bridge/')) {
      await this.routeBridge(req, res, url, path, method);
      return;
    }
    if (path.startsWith('/api/') && method === 'POST') {
      const session = this.game.requireSession(bearerToken(req));
      const body = await readJsonBody(req);
      switch (path) {
        case '/api/claim':
          sendJson(res, 200, { territory: this.game.claim(session.governorId, body.territoryId, body.overseerId) });
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
        case '/api/develop':
          sendJson(res, 200, this.game.develop(session.governorId, body.territoryId, body.track));
          return;
        case '/api/enrich':
          sendJson(res, 200, this.game.enrich(session.governorId, body.territoryId, body.amountCtUnits, body.amountCt));
          return;
        case '/api/raze':
          sendJson(res, 200, this.game.raze(session.governorId, body.territoryId, body.track));
          return;
        case '/api/buy-ct':
          // E5 purchase-cap stub: real payments are out of scope; the cap that
          // WILL apply per account per epoch is ⚙ balance.economy.purchaseCapCtPerEpoch.
          throw new ApiError(
            501,
            'NOT_ENABLED',
            `CT purchases are not enabled yet; when they are, buys are capped at ${this.game.purchaseCapCtPerEpoch()} ct_units per account per epoch`,
          );
        case '/api/choice':
          sendJson(res, 200, this.game.choice(session.governorId, body.battleId, body.action, body.overseerId));
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

  /**
   * /bridge/* — the telemetry-relay API for external match servers
   * (docs/briefs/TELEMETRY-RELAY.md). Shared-secret auth: every request must
   * carry `Authorization: Bearer $BRIDGE_SECRET` (POST /bridge/battles/start
   * also accepts `{token}` in the body for curl convenience). Disabled (503)
   * unless the server was configured with a secret.
   *
   *   POST /bridge/battles/start          register a battle → {battleId,…}
   *   POST /bridge/battles/:id/snapshot   telemetry frame (2–4 Hz) → viewer fan-out
   *   GET  /bridge/battles/:id/commands?afterSeq=N   queued command-mode inputs
   *   POST /bridge/battles/:id/end        {winner:'A'|'B'|'DRAW', summary?}
   */
  private async routeBridge(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
    method: string,
  ): Promise<void> {
    const secret = this.config.bridgeSecret;
    if (secret === undefined || secret === '') {
      throw new ApiError(503, 'BRIDGE_DISABLED', 'battle bridge is not enabled (set BRIDGE_SECRET)');
    }
    const body = method === 'POST' ? await readJsonBody(req) : {};
    const presented = bearerToken(req) ?? (typeof body['token'] === 'string' ? body['token'] : undefined);
    if (presented === undefined || !secretsEqual(presented, secret)) {
      throw new ApiError(401, 'BAD_BRIDGE_SECRET', 'missing or wrong bridge secret');
    }

    if (path === '/bridge/battles/start' && method === 'POST') {
      const out = this.bridge.start(body);
      sendJson(res, 200, {
        ...out,
        snapshotUrl: `/bridge/battles/${out.battleId}/snapshot`,
        commandsUrl: `/bridge/battles/${out.battleId}/commands`,
        endUrl: `/bridge/battles/${out.battleId}/end`,
      });
      return;
    }
    const m = /^\/bridge\/battles\/([^/]+)\/(snapshot|commands|end)$/.exec(path);
    if (m === null) throw new ApiError(404, 'UNKNOWN_ENDPOINT', `no such endpoint ${method} ${path}`);
    const battleId = decodeURIComponent(m[1]!);
    const leaf = m[2]!;
    if (leaf === 'snapshot' && method === 'POST') {
      sendJson(res, 200, this.bridge.snapshot(battleId, body));
      return;
    }
    if (leaf === 'commands' && method === 'GET') {
      const afterSeq = Number(url.searchParams.get('afterSeq') ?? '0');
      sendJson(res, 200, this.bridge.commandsAfter(battleId, afterSeq));
      return;
    }
    if (leaf === 'end' && method === 'POST') {
      sendJson(res, 200, this.bridge.end(battleId, body));
      return;
    }
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', `${method} not allowed on ${path}`);
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

/** Constant-time shared-secret comparison (hash first — inputs differ in length). */
function secretsEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

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
