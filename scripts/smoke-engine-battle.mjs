#!/usr/bin/env node
/**
 * Engine-battle smoke test (docs/briefs/ALLOCATE-CALLBACK-SCHEMA.md §3b).
 *
 * Drives a REAL overworld PvP battle end-to-end against a running Clash Front
 * server, using only the public API: two governors join, claim adjacent
 * parcels, muster STANDARD armies, and one marches at the other. With
 * BATTLE_ENGINE_URL configured on the server, the battle allocates on the M1
 * battle engine and resolves via its HMAC callback — the resolved battle
 * reports resolutionMode ACCELERATED. Without the engine (or on allocate
 * failure) it resolves instantly (AUTO): the fallback path, also visible here.
 *
 *   node scripts/smoke-engine-battle.mjs [--server http://127.0.0.1:8130]
 */
const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const SERVER = argOf('--server', 'http://127.0.0.1:8130').replace(/\/+$/, '');
const TIMEOUT_MS = Number(argOf('--timeout', '180000'));

const log = (msg) => console.log(`[smoke] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { token, body } = {}) {
  const res = await fetch(SERVER + path, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text === '' ? undefined : JSON.parse(text) };
}

async function main() {
  const t0 = Date.now();
  const stamp = Math.random().toString(36).slice(2, 8);
  const world = (await api('/api/world')).json;
  log(`world: zone ${world.meta.zone}, ${world.parcels.length} parcels, tickMs ${world.meta.tickMs}`);

  const atk = (await api('/api/join', { body: { name: `SmokeAtk-${stamp}` } })).json;
  const def = (await api('/api/join', { body: { name: `SmokeDef-${stamp}` } })).json;
  log(`joined: attacker ${atk.governorId} / defender ${def.governorId}`);

  // Territory lookup: parcel → territory governorKind (public on /api/state).
  const state0 = (await api('/api/state')).json;
  const terrById = new Map(state0.territories.map((t) => [t.id, t]));
  const byParcel = new Map(world.parcels.map((p) => [p.id, p]));
  const isFreeWild = (parcelId) => {
    const p = byParcel.get(parcelId);
    const t = p === undefined ? undefined : terrById.get(p.territoryId);
    return t !== undefined && t.governorKind === 'SYSTEM';
  };

  // Claim two adjacent wild parcels (retry past monster-occupied ones).
  let defTerr;
  let atkTerr;
  outer: for (const p of world.parcels) {
    if (!isFreeWild(p.id)) continue;
    for (const n of p.neighbors) {
      if (!isFreeWild(n)) continue;
      const c1 = await api('/api/claim', { token: def.token, body: { territoryId: byParcel.get(p.id).territoryId } });
      if (c1.status !== 200) break; // occupied/expensive — next candidate
      const c2 = await api('/api/claim', { token: atk.token, body: { territoryId: byParcel.get(n).territoryId } });
      if (c2.status !== 200) continue;
      defTerr = c1.json.territory;
      atkTerr = c2.json.territory;
      break outer;
    }
  }
  if (defTerr === undefined) throw new Error('could not claim two adjacent wild parcels');
  log(`claimed: defender ${defTerr.name} (${defTerr.parcelId}) / attacker ${atkTerr.name} (${atkTerr.parcelId})`);

  const defArmy = (await api('/api/raise', { token: def.token, body: { territoryId: defTerr.id, preset: 'STANDARD' } })).json.army;
  const atkArmy = (await api('/api/raise', { token: atk.token, body: { territoryId: atkTerr.id, preset: 'STANDARD' } })).json.army;
  log(`mustering STANDARD armies ${atkArmy.id} vs ${defArmy.id} (training takes ticks)…`);

  // March as soon as the muster completes (409 MUSTERING until then).
  let marched = false;
  while (!marched) {
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error('timeout waiting for muster');
    const m = await api('/api/march', { token: atk.token, body: { armyId: atkArmy.id, toTerritoryId: defTerr.id } });
    if (m.status === 200) {
      marched = true;
      log(`marching at ${defTerr.name} — ETA tick ${m.json.etaTick}`);
    } else if (m.json?.error?.code === 'MUSTERING') {
      await sleep(1000);
    } else {
      throw new Error(`march failed: ${JSON.stringify(m.json)}`);
    }
  }

  // Watch for the battle: pending (engine/live) → resolved.
  let announced = false;
  for (;;) {
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error('timeout waiting for battle resolution');
    const st = (await api('/api/state', { token: atk.token })).json;
    const live = st.liveBattles.find((b) => b.parcelId === defTerr.parcelId);
    if (live !== undefined && !announced) {
      announced = true;
      log(`battle ${live.id} RUNNING on ${defTerr.parcelId} (pending resolution)…`);
    }
    const battle = st.battles.find(
      (b) => b.parcelId === defTerr.parcelId && b.attackerGovernorIds.includes(atk.governorId),
    );
    if (battle !== undefined) {
      const via =
        battle.resolutionMode === 'ACCELERATED'
          ? 'the EXTERNAL BATTLE ENGINE (allocate → HMAC callback)'
          : battle.resolutionMode === 'LIVE'
            ? 'the built-in live tactical sim'
            : 'the INSTANT internal resolver (engine off or fallback)';
      log(`battle ${battle.id} RESOLVED via ${via}`);
      log(`  winner: ${battle.winner}  score ${battle.attackerScore ?? '?'}:${battle.defenderScore ?? '?'}`);
      log(`  casualties: ${JSON.stringify(battle.casualties ?? {})}`);
      const my = st.my?.pendingChoices?.find((c) => c.battleId === battle.id);
      if (my !== undefined) {
        const loot = (await api('/api/choice', { token: atk.token, body: { battleId: battle.id, action: 'PILLAGE' } })).json;
        log(`  post-victory PILLAGE → loot ${loot.battle?.lootCt ?? 0} ct_units`);
      }
      log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s ✅`);
      return;
    }
    await sleep(1000);
  }
}

main().catch((e) => {
  console.error(`[smoke] FAILED: ${e.message}`);
  process.exit(1);
});
