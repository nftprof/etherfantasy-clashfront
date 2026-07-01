// Queue → form match. Two ways a match forms:
//   1) PARTY: the lobby launches a room of players, each joining with the SAME
//      `party` id. As soon as a party has TEAM_SIZE*2 seats waiting, we pop exactly
//      those seats into one Match, honoring their lobby-assigned teams. This is what
//      keeps a launched group together (and on the right sides).
//   2) FIFO fallback: partyless seats (e.g. raw ws smoke tests) pair in arrival order.
// (Redis-backed cross-box queue is a P4 concern; in-memory is fine for one box / 200 ccu.)
import { Match } from "./match.js";
import { config } from "../config.js";

export class Matchmaker {
  constructor() { this.queue = []; this.matches = new Map(); this.bySeat = new Map(); this.timers = new Map(); }

  enqueue(seat) {
    this.queue.push(seat);
    // start a grace timer the first time we see a party, so it can never hang waiting
    // on a seat that never connects (and solo-vs-AI forms on its own size anyway).
    if (seat.party && !this.timers.has(seat.party)) {
      this.timers.set(seat.party, setTimeout(() => this.graceForm(seat.party), config.MATCH_GRACE_MS));
    }
    this.tryForm();
  }

  tryForm() {
    const need = config.TEAM_SIZE * 2;

    // 1) party groups — form once all EXPECTED seats (party size from the lobby) have arrived.
    //    Solo-vs-AI (ps=1) forms instantly; 1v1 (ps=2) when both connect; bots fill any gap.
    const parties = new Map();
    for (const s of this.queue) {
      if (!s.party) continue;
      if (!parties.has(s.party)) parties.set(s.party, []);
      parties.get(s.party).push(s);
    }
    for (const [pid, seats] of parties) {
      const known = seats.some(s => s.ps > 0);
      const want = known ? Math.max(1, ...seats.map(s => s.ps || 0)) : need; // ps unknown (old client) → old behavior
      if (seats.length >= want) this.popParty(pid, seats);
    }

    // 2) FIFO fallback for partyless seats
    while (this.queue.filter(s => !s.party).length >= need) {
      const group = [];
      for (let i = 0; i < this.queue.length && group.length < need; i++) {
        if (!this.queue[i].party) group.push(this.queue[i]);
      }
      for (const g of group) { const i = this.queue.indexOf(g); if (i >= 0) this.queue.splice(i, 1); }
      this.formMatch(group, false);
    }
  }

  // pull every queued seat of a party into one match (bot-fill balances missing seats)
  popParty(pid, seats) {
    for (const g of seats) { const i = this.queue.indexOf(g); if (i >= 0) this.queue.splice(i, 1); }
    const t = this.timers.get(pid); if (t) { clearTimeout(t); this.timers.delete(pid); }
    this.formMatch(seats, true);
  }

  // grace expired: form with whoever showed up for this party (≥1), rather than hang forever
  graceForm(pid) {
    this.timers.delete(pid);
    const seats = this.queue.filter(s => s.party === pid);
    if (seats.length >= 1) this.popParty(pid, seats);
  }

  // Party groups keep the lobby's team assignment verbatim (so co-op = all on one team;
  // the world's bot-fill then creates AI opponents on the empty team). FIFO fallback
  // (raw/partyless seats) just splits even/odd.
  formMatch(group, honorTeam) {
    if (!honorTeam) group.forEach((s, i) => { s.team = i % 2; });
    const match = new Match(group);
    this.matches.set(match.id, match);
    for (const s of group) this.bySeat.set(s.seatId, match);
  }

  input(seatId, validated) { const m = this.bySeat.get(seatId); if (m) m.input(seatId, validated); }

  control(seatId, msg) { const m = this.bySeat.get(seatId); if (m && m.control) m.control(seatId, msg); }

  remove(seatId) {
    const qi = this.queue.findIndex(s => s.seatId === seatId);
    if (qi >= 0) this.queue.splice(qi, 1);
    const m = this.bySeat.get(seatId);
    if (m) { m.dropSeat(seatId); this.bySeat.delete(seatId); }
  }

  stats() {
    let live = 0; for (const m of this.matches.values()) if (!m.ended) live++;
    return { queued: this.queue.length, matches: live };
  }
}
