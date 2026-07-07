# Map economy — what the SEEDING layer places + what the integration path must sync

> Companion to `MAP-PIPELINE-GLOSSARY.md` (read that first for the artifact/pipeline model) and to the
> locked combat economy in `../reports/BATTLE-MAP-AND-UNIT-SPEC.md` + `../reports/FARMING-AND-UNIT-LIFECYCLE.md`.
> **Purpose:** give the **map-maker / generator** session the exact **resource + entity catalog the seeding
> pass (layer ②) must place**, and give the **MOBA / integration** session the **economy parameters that
> must travel** allocate → match → settlement callback for the economy to actually work. Author: CF
> Overworld design, 2026-07-07. **CF concurs with the one-artifact-many-views model + the base-terrain /
> seeding two-pass split** (glossary open-Q #4/#5) — this doc is the economy content of layer ②.

## 0. Where this plugs into the pipeline

- **Layer ① base terrain** (bulk ~20K): landscape/biome/rivers/walkable field/lane skeleton — **no economy
  content**. Unchanged by this doc.
- **Layer ② seeding** (lazy, near-player): **this is the economy layer.** Everything below is placed here,
  deterministically from `seed = parcelId + tier + biome`, into the artifact's `structures` / `mobs` /
  `resources` fields the base pass left empty. **The generator places it; the LLM only sets the params
  (counts/bias) within the tier budget.**
- **Thumbnail (file D `thumb.png`)** feeds the **CF overworld texturing** (canon decision 10: parcel-map
  PNG thumbnails texture the overworld). So the seed pass isn't just for battles — its visible richness
  (resource nodes, castle, wild) is what a player *sees* on the top-level CF map. Seed determinism ⇒ stable
  thumbnails.

---

## 1. The seeding catalog — what the generator must place in layer ②

All counts come from the parcel's **`INVEST_TIERS` tier** (0–5) and **biome**; see `BATTLE-MAP-AND-UNIT-SPEC`
§1–§2 for the authoritative tables. The seed pass places these entity classes:

| # | Entity to seed | Count driver | Key economy rules the map must encode |
|---|---|---|---|
| 1 | **Gold tile** | tier (2→8 tiles total, split by biome) | **FINITE** — reserve depletes as mined, does **not** regrow; **enrich-seeded** (owner CT sets the reserve). Yield ⚙ **~50 gold** @100% richness. Gold is **match-local tactical** currency (hires/trains elites), not overworld balance. |
| 2 | **Wood grove** | tier + biome (wood-biased biomes) | **RENEWABLE** — regrows to full over ⚙ **~3 world-days** (`woodRegrowDays`). Yield ⚙ **~60 wood**. Feeds arms-crafting. |
| 3 | **Ore / iron outcrop** | tier + biome (ore-biased: hills/`UW3`) | **FINITE** like gold. Yield ⚙ **~40 iron**. Feeds **arms** (worker→soldier) + Industry craft. `UW3` = **ore-default** biome. |
| 4 | **Food-yield field** *(new — flag for map team)* | biome (plains/leaf high) + tier | **Farmed on the overworld**, not in-battle. Sets the parcel's **food production rate** (army upkeep + battle clock + pop growth). See `FARMING` §3b. Map should mark food-rich ground. |
| 5 | **Rare-resource node** (gems=Carat/CT-tier, rare cores, reagents) | **boss-gated**, tier-4+ / wild | **Only revealed by beating the parcel BOSS** (§5f). Placed **latent**; unlocks on boss-clear; **finite window** then re-clear/enrich to refresh. Top of the resource ladder. |
| 6 | **Mob camp (wild guardians)** | tier (1→6 camps) | **Richer land spawns MORE monsters** — the "fight while you mine" + turtle-farm escalation. Wild strength per §2 below. |
| 7 | **BOSS spawn** | tier-4+ / wild estates | **Tuned HARDER than the attacker** (net-sink, §5f). Gates the rare node (#5). From the 10-boss roster. |
| 8 | **Command center** | land military development (tier) | In-battle structure: **gold trains/recruits ELITES** here. Persists across battles; capture intact = use it. |
| 9 | **Owner tier-defenses** (walls/towers/gates/traps) | tier (0→6 towers, 0→4 walls) | **Persist** across battles (owner CT investment). The teeth that let **masterless/uncommanded land** defend (`FARMING` §5). Pillage ⇒ ~30% materials. |
| 10 | **Spawn zones + lane skeleton** | base terrain ① (skeleton) | Economy note: a Master reinforcement's arrival **creates a new edge spawn = a new lane** (canon decision 11). Seed must leave edge-spawn anchors. |
| 11 | **Garrison / population presence** | ≥ `minGarrison` **100 pets** to be a live farm/defense | Encodes the **≥100-per-side battle floor** (§5c) and the land's **population** (draft cap 50%→100%, `FARMING` §3a). |

**Determinism guardrail (AGENTS prime directive):** every placement above is a pure function of
`seed = parcelId+tier+biome` — same seed ⇒ byte-identical seeding ⇒ stable thumbnails + golden-master
battles. **No `Math.random` at seed time**; use the seeded RNG.

**Biome sets two things** (`BATTLE-MAP-AND-UNIT-SPEC` §2): (a) the **gold-vs-wood-vs-ore split** of the
resource tiles, and (b) the **local unit species pool** the map spawns (the pets whose element sits in that
biome — `../populace-pet-spec/role-scarcity-summary.md`). **Richer/higher-tier land can spawn STRONGER
units** (§5g). Owner bias may tilt the resource split ±20%.

---

## 2. Wild strength — the seed must scale mobs to the ZONE (two families)

Wild placed in layer ② is **never trivially weak** — it scales to the zone (`BATTLE-MAP-AND-UNIT-SPEC` §5g):

- **UW (Underworld) zones = RANGE:** wild strength **30%–200%** of the zone's average player strength,
  rolled per encounter, zone-weighted. **`UW3` = high end + ore-default.**
- **HS (High Society) zones = FIXED multiplier** strictly scaled to the player: **HS1 1× / HS2 2× / HS3
  (top floating island) 3×.** Heavenly-guarded; later phase.

**Map-team action:** the seed pass needs the **zone id + zone-average-strength** as an input so it can size
mob camps/boss to the right band. (Zone → family/multiplier table comes from the map team's zone brief.)

---

## 3. Params the INTEGRATION / MOBA path must sync (allocate → match → callback)

For the economy to resolve correctly, these must travel with the battle. Grouped by when they matter. All
are ⚙ dials owned by CF's `balance.json`; the engine/bridge **consumes** them (does not invent them).

### 3a. Allocate-time context (CF → engine, per `ALLOCATE-CALLBACK-SCHEMA.md`)
| Param | Value / source | Why the match needs it |
|---|---|---|
| **CF artifact obstacle + walk layers** | the parcel artifact (deterministic) | **Load-bearing (glossary open-Q #1):** a CF parcel battle must consume the artifact's authored obstacles/walkability, **not re-roll** them (legacy-only behavior). Command view ↔ 3D fidelity depends on it. |
| **Coordinate frame** | fixed **±161 world-units** (`sizeM 322`), spawns ±131.6, cores ±114.8, consumed as-is (no ×MAPK) | already canon (§4g); every parcel + estate component uses it. |
| **Elite : line = max 1 : 3** | `battle.eliteLineRatio` | **DEPLOYMENT/wave cap** — units come out ≤1 elite per 3 line; 0 elite ok; line exhaustion cuts off surplus elites. Matches current wave. |
| **Army provisions → battle clock** | food load = f(army size, march dist); **min 5 min** full, then ~3 min degrading | Match must **deplete food → drop morale → down to a 10% effectiveness floor** (§5h). This is the stall-breaker + doomstack cap. |
| **Wild strength band / multiplier** | zone family (§2) | AI/wild sizing for player-vs-wild + masterless-land auto-resolve. |
| **Command vs auto + queue** | existing keystone (decision 15/16) | unchanged; live iff commanded + slot + pool. |

### 3b. Settlement callback (engine → CF, what CF applies next tick)
| Result field the callback must report | Feeds |
|---|---|
| **Casualties per side** (line / elite / worker split) | roster reconcile; **workers mostly survive → accumulate** (§5); elites persist if inventoried. |
| **Arms consumed + salvage** | **arms burned on each line-soldier death; winner salvages ~30% of ALL fallen (both sides).** Materials sink + winner's loot (§5d). |
| **Battle outcome** (win / loss / **DRAW** / **retreat**) | DRAW = max-time or stall (no kills for a window) ⇒ no land change, spent food/arms lost. **RETREAT** = flee penalties below. |
| **Retreat capture** | on flee: **5–30% arms dropped**, **10–80% units lost** (scaled by how badly losing), **~30% of lost units convert to the enemy** (§5i). |
| **Gold spent in-match** | **match-local only** — must NOT credit the overworld balance (§1: no mine-to-get-rich). |
| **Rare-node unlock flag** (on boss-clear) | reveals the latent rare node (#5) on the CF overworld for a finite window. |
| **Swift-win performance score** | speed 0.4 / kill-share 0.35 / survivor-rate 0.25, scored vs the player's own rolling median → the wild-elite-join bonus (§5e). Engine must report the raw metrics; CF computes the reward. |
| **Structure state** (survived / damaged / destroyed) | persistence + pillage (~30% materials) vs occupy-to-inherit (§6). |

### 3c. The economy invariant the integration must never break (decision 17)
- **No in-match action mints CT.** Gold/wood/iron/food are **backend resources**; CT is the on-chain base
  layer. The match reports resource *flows*; **CT settlement stays on the CF side**, per-user-capped.
- **In-game rewards = earning back your own spend** (boss net-sink, pillage, land yield). **Net-positive
  only via leaderboard + discretionary vault grants** (e.g. strong weapon-NFTs) — never an emergent faucet.
  The engine should assume **the base loop is negative-sum by construction** and not "pay out" anything.

---

## 4. Additions the map team should note (net-new vs. the current generator)

1. **Food-yield field (#4)** — a new seeded resource class (or a biome attribute) marking food-rich ground;
   drives overworld farming, not in-battle harvesting.
2. **Latent rare-resource node (#5)** — placed but **hidden until boss-clear**; needs an "unlocked" state
   flag in the artifact.
3. **Boss difficulty = net-sink** — bosses seed **above** local player strength on purpose (§5g/§5f).
4. **Zone input** — the seed pass needs `zoneId + zoneAvgStrength` (§2) to size wild/boss correctly.
5. **Finite vs renewable flags per node** — gold/iron/rare = finite (deplete + enrich-reseed); wood =
   regrow ~3d. The artifact should carry each node's `reserve` + `renewable` so the CF overworld can track
   depletion across battles (the anti-farm rule, decision 17-safe).
6. **Determinism** — all of the above from the seeded RNG only; stable seeding = stable thumbnails + golden
   battles.

## 5. One-line summary

**Layer ② seeding = the economy layer:** the generator deterministically places gold(finite)/wood(regrow)/
iron/food/rare(boss-gated) nodes + mob-camps/boss(net-sink) + command-center/towers + ≥100-pet garrison,
scaled by `INVEST_TIERS` tier × biome × zone-strength; the integration path must carry the artifact's
obstacle/walk layers + the elite-1:3 / food-clock / arms-salvage / retreat / draw / swift-win params so the
match resolves the economy correctly — and **nothing in-match mints CT** (decision 17).
