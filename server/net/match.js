// One authoritative match. Phases:
//   DRAFT — champion select (countdown). Clients pick a champion + signal asset-ready.
//           PAID matches also: each client sends its wallet → server createGame(escrow) →
//           clients stake 10 CT → server verifies bothStaked on-chain. Match goes LIVE only
//           when everyone picked + ready (+ for paid, both teams staked) — else countdown
//           force-starts (free) or refunds+aborts (paid).
//   LIVE  — world ticks at TICK_HZ, applies inputs, broadcasts snapshots.
//   On win: PAID matches settle(escrow, winningTeam) → winner gets entry + 50% of losers.
import { makeWorld } from "../sim/state.js";
import { step } from "../sim/step.js";
import { encodeSnapshot } from "../snapshot.js";
import { config } from "../config.js";
import * as escrow from "../chain/playEscrow.js";
import * as vip from "../vip.js";

let _matchId = 1;
const isAddr = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);

export class Match {
  constructor(seats) {
    this.id = _matchId++;
    this.seed = (Date.now() ^ (this.id * 2654435761)) >>> 0;
    this.seats = seats; // [{seatId, team, slot, name, ws, paid}]
    this.dt = 1 / config.TICK_HZ;
    this.snapEvery = Math.max(1, Math.round(config.TICK_HZ / config.SNAPSHOT_HZ));
    this.ended = false;

    // PAID only if the lobby flagged every seat paid AND the escrow contract is configured.
    this.paid = seats.length > 0 && seats.every(s => s.paid) && escrow.isEnabled();
    this.escrowId = this.paid ? escrow.matchId("efm-" + this.id) : null;
    this.wallets = new Map();      // seatId -> wallet address (paid)
    this.escrowCreated = false; this.staked = false; this.stakePoll = null;
    // LOOT: single-player grind (vs AI). Win → 1/5 CT from spPool, only if VIP-quota or paid.
    this.loot = !this.paid && seats.length > 0 && seats.every(s => s.loot) && escrow.isEnabled();
    this.lootSeat = this.loot ? seats[0] : null;  // the (single) human grinder
    this.lootWallet = null; this.lootEligible = false; this.lootPaid = false;

    // ---- DRAFT phase ----
    this.phase = "draft";
    this.picks = new Map();
    this.picksEl = new Map();
    this.ready = new Set();
    this.pickSec = config.PICK_SEC;
    this.send({
      t: "draft", matchId: this.id, pickSec: this.pickSec,
      paid: this.paid, loot: this.loot, escrowId: this.escrowId, entry: (this.paid || this.loot) ? "10" : "0",
      seats: seats.map(s => ({ seatId: s.seatId, team: s.team, name: s.name })),
    });
    this.draftTimer = setTimeout(() => this.forceStart(), this.pickSec * 1000);
    console.log(`[match ${this.id}] DRAFT seats=${seats.length} paid=${this.paid} loot=${this.loot} pick=${this.pickSec}s`);
    if (this.loot) this.resolveLootFromLobby(); // grind eligibility comes from the lobby-resolved wallet/payment
  }

  control(seatId, msg) {
    if (this.phase !== "draft") return;
    if (msg.t === "wallet" && isAddr(msg.addr)) {
      if (this.paid) { this.wallets.set(seatId, msg.addr); this.maybeCreateGame(); }
      else if (this.loot) { this.lootWallet = msg.addr; this.resolveLoot(); }
    } else if (msg.t === "paid" && this.loot && typeof msg.tx === "string") {
      this.confirmLootPayment(msg.tx);
    } else if (msg.t === "pick" && Number.isInteger(msg.slot)) {
      this.picks.set(seatId, msg.slot);
      if (typeof msg.el === "string") this.picksEl.set(seatId, msg.el.slice(0, 16));
      this.send({ t: "picks", picks: [...this.picks].map(([sid, slot]) => ({ seatId: sid, slot })) });
      this.maybeBegin();
    } else if (msg.t === "ready") {
      this.ready.add(seatId);
      this.maybeBegin();
    }
  }

  // PAID: once every seat's wallet is in, register the on-chain game, then open staking + poll.
  maybeCreateGame() {
    if (!this.paid || this.escrowCreated) return;
    if (!this.seats.every(s => this.wallets.has(s.seatId))) return;
    this.escrowCreated = true; // guard against double-create
    const teamA = this.seats.filter(s => s.team === 0).map(s => this.wallets.get(s.seatId));
    const teamB = this.seats.filter(s => s.team === 1).map(s => this.wallets.get(s.seatId));
    console.log(`[match ${this.id}] createGame escrow=${this.escrowId} A=${teamA.length} B=${teamB.length}`);
    escrow.createGame(this.escrowId, teamA, teamB)
      .then(() => { this.send({ t: "stakeOpen", escrowId: this.escrowId, entry: "10" }); this.pollStakes(); })
      .catch((e) => { this.escrowCreated = false; console.error(`[match ${this.id}] createGame failed: ${e.message}`); this.send({ t: "escrowError", reason: "createGame" }); });
  }

  // LOOT: resolve eligibility — use a lifetime free play if available, else ask to pay 10 CT.
  // Grind eligibility resolved from the LOBBY (wallet + optional payment), so the in-game client
  // never pops a wallet. paid tx → verify; else free quota → consume; else no loot (play-for-fun).
  async resolveLootFromLobby() {
    const w = this.lootSeat && this.lootSeat.wallet;
    if (!w) return; // no wallet → play-for-fun, no loot
    this.lootWallet = w;                              // loot CT pays out to the connected wallet
    const name = (this.lootSeat && this.lootSeat.name) || ""; // VIP tier + lifetime quota are per ACCOUNT
    try {
      if (this.lootSeat.grindPaidTx) {
        if (await escrow.verifyEntryPaid(this.lootSeat.grindPaidTx, w)) { this.lootEligible = true; this.send({ t: "lootReady", mode: "paid" }); }
      } else {
        const tier = await vip.vipTier(name);
        if (vip.freeRemaining(name, tier) > 0) { vip.consumeFree(name); this.lootEligible = true; this.send({ t: "lootReady", mode: "free", tier }); }
      }
    } catch (e) { console.error(`[match ${this.id}] resolveLootFromLobby: ${e.message}`); }
  }

  async resolveLoot() {
    if (!this.loot || this.lootEligible || this._lootResolving) return;
    this._lootResolving = true;
    try {
      const tier = await vip.vipTier(this.lootWallet);
      if (vip.freeRemaining(this.lootWallet, tier) > 0) {
        vip.consumeFree(this.lootWallet); this.lootEligible = true;
        this.send({ t: "lootReady", mode: "free", tier, remaining: vip.freeRemaining(this.lootWallet, tier) });
      } else {
        this.send({ t: "payEntry", entry: "10" }); // no free quota → pay to play for loot
      }
    } catch (e) { console.error(`[match ${this.id}] resolveLoot: ${e.message}`); }
    this._lootResolving = false;
  }
  async confirmLootPayment(tx) {
    if (!this.loot || this.lootEligible) return;
    try {
      if (await escrow.verifyEntryPaid(tx, this.lootWallet)) {
        this.lootEligible = true; this.lootPaid = true;
        this.send({ t: "lootReady", mode: "paid" });
      } else { this.send({ t: "escrowError", reason: "payEntry" }); }
    } catch (e) { console.error(`[match ${this.id}] confirmLootPayment: ${e.message}`); this.send({ t: "escrowError", reason: "payEntry" }); }
  }

  pollStakes() {
    if (this.stakePoll) return;
    this.stakePoll = setInterval(async () => {
      try {
        if (await escrow.bothStaked(this.escrowId)) {
          this.staked = true; clearInterval(this.stakePoll); this.stakePoll = null;
          this.send({ t: "staked" }); this.maybeBegin();
        }
      } catch (e) { /* transient RPC — keep polling */ }
    }, 3000);
  }

  maybeBegin() {
    const allPicked = this.seats.every(s => this.picks.has(s.seatId));
    const allReady = this.seats.every(s => this.ready.has(s.seatId));
    const escrowOk = !this.paid || this.staked;
    if (allPicked && allReady && escrowOk) this.begin();
  }

  forceStart() {
    if (this.phase !== "draft") return;
    if (this.paid && !this.staked) { // never start a paid match without stakes → refund + abort
      console.log(`[match ${this.id}] paid draft expired without stakes → abort/refund`);
      return this.abortPaid("timeout");
    }
    for (const s of this.seats) if (!this.picks.has(s.seatId)) this.picks.set(s.seatId, 0);
    console.log(`[match ${this.id}] draft countdown expired → force start`);
    this.begin();
  }

  begin() {
    if (this.phase !== "draft") return;
    this.phase = "live";
    clearTimeout(this.draftTimer);
    if (this.stakePoll) { clearInterval(this.stakePoll); this.stakePoll = null; }
    const seated = this.seats.map(s => ({
      seatId: s.seatId, team: s.team, name: s.name, slot: this.picks.get(s.seatId) ?? 0,
      el: this.picksEl.get(s.seatId) || "Neutral",
    }));
    this.world = makeWorld(this.seed, seated);
    this.inputs = new Map(this.seats.map(s => [s.seatId, []]));
    this.send({ t: "start", matchId: this.id, seed: this.seed, paid: this.paid, seats: seated });
    this.timer = setInterval(() => this.tick(), 1000 / config.TICK_HZ);
    console.log(`[match ${this.id}] LIVE paid=${this.paid} picks=[${[...this.picks.values()].join(",")}]`);
  }

  input(seatId, validated) { const q = this.inputs && this.inputs.get(seatId); if (q) q.push(validated); }

  tick() {
    if (this.ended || this.phase !== "live") return;
    step(this.world, this.dt, this.inputs);
    if (this.world.tick % this.snapEvery === 0) this.send(encodeSnapshot(this.world));
    if (this.world.winner != null) this.end(this.world.winner);
  }

  end(winner) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer); clearTimeout(this.draftTimer);
    if (this.stakePoll) { clearInterval(this.stakePoll); this.stakePoll = null; }
    this.send({ t: "end", winner });
    console.log(`[match ${this.id}] ended, winner team ${winner}`);
    // PAID payout: only if stakes were actually placed. team 0 => winningTeam 1, team 1 => 2.
    if (this.paid && this.staked && winner != null && this.escrowId) {
      const winningTeam = winner === 0 ? 1 : 2;
      escrow.settle(this.escrowId, winningTeam)
        .then((h) => console.log(`[match ${this.id}] settled team ${winningTeam}, tx ${h}`))
        .catch((e) => console.error(`[match ${this.id}] settle FAILED: ${e.message}`));
    }
    // LOOT payout: single-player grinder won (their team) and the play was quota/paid
    if (this.loot && this.lootEligible && this.lootWallet && this.lootSeat && winner === this.lootSeat.team) {
      const amount = vip.rollLoot();
      const nonce = escrow.matchId("loot-" + this.id + "-" + this.lootWallet);
      escrow.creditLoot(this.lootWallet, amount, nonce)
        .then((h) => { this.send({ t: "loot", amount, tx: h }); console.log(`[match ${this.id}] loot ${amount} CT → ${this.lootWallet} tx ${h}`); })
        .catch((e) => console.error(`[match ${this.id}] creditLoot FAILED: ${e.message}`));
    }
  }

  // refund staked entries (if any) and abort the paid match without playing
  abortPaid(reason) {
    if (this.ended) return;
    this.ended = true; this.phase = "ended";
    clearTimeout(this.draftTimer);
    if (this.stakePoll) { clearInterval(this.stakePoll); this.stakePoll = null; }
    if (this.escrowCreated && this.escrowId) {
      escrow.refund(this.escrowId)
        .then((h) => console.log(`[match ${this.id}] refunded, tx ${h}`))
        .catch((e) => console.error(`[match ${this.id}] refund FAILED: ${e.message}`));
    }
    this.send({ t: "end", winner: null, aborted: true, reason });
  }

  send(obj) {
    const raw = JSON.stringify(obj);
    for (const s of this.seats) { try { if (s.ws && s.ws.readyState === 1) s.ws.send(raw); } catch {} }
  }

  dropSeat(seatId) {
    if (this.phase === "draft") {
      if (this.paid && this.escrowCreated) return this.abortPaid("player-left"); // refund staked paid match
      this.picks.delete(seatId); this.ready.delete(seatId); this.wallets.delete(seatId);
      this.seats = this.seats.filter(s => s.seatId !== seatId);
      if (this.seats.length === 0) { this.ended = true; clearTimeout(this.draftTimer); }
      else this.maybeBegin();
      return;
    }
    const seat = this.seats.find(s => s.seatId === seatId);
    if (seat && !this.ended) this.end(seat.team === 0 ? 1 : 0); // live leaver: opponents win (paid → settles)
  }
}
