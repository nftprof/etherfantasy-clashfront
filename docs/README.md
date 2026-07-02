# Clash Front — Design & Agent Development Bible

> **Clash Front** is the persistent-world war layer of the **Ether Fantasy (EF)** ecosystem.
> Players build nations, own land, lead armies across a living map, and personally drop into
> battles as heroes. The world never resets; every battle changes the map.
>
> **Product tagline:** *Use Your Strength to Change the World.*

This repository holds the **macro / overworld** design and implementation spec. The moment-to-moment
combat (MOBA, siege, naval) is delivered by **EF MOBA** and is treated here as an integrated service,
not re-specified. This bible is written to be consumed by AI coding agents (Claude Code, Cursor, Codex)
working subsystems in parallel.

---

## How to read this bible

Each document is self-contained but shares a single **canon** (terminology, resources, IDs, schemas)
defined below and in [`08-data-models.md`](./08-data-models.md). **Never redefine a canonical term.**
If a term is missing, add it to this README's Glossary in the same PR.

| Doc | Scope | Primary owner (agent role) |
|-----|-------|----------------------------|
| [00 — Vision & Product](./00-vision-and-product.md) | Pillars, ecosystem, player journey, monetization | Product |
| [01 — World Simulation](./01-world-simulation.md) | Hex map, territories, travel, logistics, supply, seasons | Sim |
| [02 — Economy](./02-economy.md) | CT, food, population, prosperity, tax, land NFT economy | Economy |
| [03 — Military](./03-military.md) | Armies, officers, units, upkeep, supply trains | Military |
| [04 — Battle System](./04-battle-system.md) | Scheduler, server allocation, resolution, EF MOBA hook | Battle |
| [05 — PvE Integration](./05-pve-integration.md) | EF Hunt, wild zones, bosses, lore | PvE |
| [06 — AI Architecture](./06-ai-architecture.md) | Governor / Military / Diplomacy / Economy AI, world sim loop | AI |
| [07 — Backend Architecture](./07-backend-architecture.md) | Services, tick engine, data stores, scaling | Backend |
| [08 — Data Models](./08-data-models.md) | Canonical schemas, IDs, enums, invariants | Data |
| [09 — API Contracts](./09-api-contracts.md) | REST + WebSocket + event bus contracts | API |
| [10 — Development Roadmap](./10-development-roadmap.md) | MVP → Alpha → Beta → Live, milestones | Program |
| [AGENTS.md](./AGENTS.md) | **How AI agents build this** — conventions, task graph, DoD | All |

**If you are an implementation agent, read [`AGENTS.md`](./AGENTS.md) first**, then your assigned
subsystem doc, then [`08-data-models.md`](./08-data-models.md).

---

## Design North Star

The single most important rule of Clash Front:

> **The macro game must matter more than any individual battle.**

Territory-war games die when the map becomes wallpaper for a lobby-based combat game. Every system here
is tuned so that *where* armies are, *when* they arrive, *whether they are supplied*, and *what a player
does to the map* matter more than the outcome of one MOBA match. A whale who wins every battle they
personally join should still lose a war if they ignore logistics, food, and diplomacy.

### The 11 Macro Pillars (non-negotiable)

1. **Territory matters** — every zone is an NFT with real yield.
2. **Travel time matters** — armies move in real time; distance is a weapon.
3. **Supply lines matter** — armies starve when cut off; roads and ports are targets.
4. **Population matters** — it produces tax, workers, and soldiers; it can die or rebel.
5. **Heroes matter but never dominate** — hero impact is capped (see below).
6. **Battles change the map** — outcomes persist forever; no instanced resets.
7. **Politics is player-driven** — alliances, vassalage, mercenaries, bounties.
8. **NPC kingdoms keep the world alive** — they fight, expand, collapse, ally 24/7.
9. **Pillage vs Occupy is a real choice** — raiders and empire-builders both thrive.
10. **Land NFTs earn from prosperity, not mere ownership** — idle land yields little.
11. **Ownership ≠ control** — the NFT owner (landlord) and the governor (ruler) are distinct roles.

### Hero Impact Cap (canonical constant)

```
BattleOutcome = f(ArmyStrength, HeroImpact, Terrain, Supply, Morale)
HeroImpact contribution is CAPPED at HERO_IMPACT_MAX = 0.20 (20%) of effective combat power.
Default target: ArmyStrength ≥ 80%, HeroImpact ≤ 20%.
```

This constant is the firewall against pay-to-win. It lives in `08-data-models.md` as `HERO_IMPACT_MAX`.

---

## The Ether Fantasy Ecosystem

Clash Front is one of four connected EF products. Shared identity, shared CT wallet, shared heroes.

| Product | Player fantasy | Purpose | Tagline |
|---------|----------------|---------|---------|
| **EF Mobile** | Discovery | Onboarding | *Begin Your Journey* |
| **EF Hunt** | Growth | Story + PvE progression | *Live the Story. Become Stronger.* |
| **EF MOBA** | Mastery | Competitive skill combat | *Prove Your Skill.* |
| **Clash Front** | Influence | Persistent world war | *Use Your Strength to Change the World.* |

The narrative flow: **Begin Your Journey → Become Stronger → Prove Yourself → Change the World.**

Clash Front is the *living world* that ties the ecosystem together: EF Hunt supplies the story and
PvE, EF MOBA supplies the combat, Clash Front supplies the persistent map those things act upon.

---

## Canonical Glossary

Single source of truth for names. All docs, code, and schemas MUST use these exact terms.

### Actors
- **Player** — a human account. Commands a roster of **Masters** and holds a **CT** wallet.
- **Master** — an EF character NFT the player **owns or rents** — the RoTK *general* of Clash Front.
  Masters lead armies as officers on the map and are the avatar a player controls when dropping into
  battles. Live source of truth: `games-etherfantasy-backend` Masters API (`docs/09` §7) — roster
  (`joinChance`, `source: owned|rented`, `rentalExpires`), KO state (`koUntil`), limited revives.
  Skill-driven, not permanently leveled by Clash Front.
- **Hero** — legacy/code name for a Master in schemas (`Hero`, `heroId`, `HERO_IMPACT_MAX`); the
  in-battle avatar aspect of a Master. New docs/text should say **Master**; a schema rename is
  deferred until the full character list lands (❓ OPEN).
- **Landlord** — holder of a **Land NFT**. Earns tax/prosperity yield. Does **not** automatically control the territory.
- **Governor** — the entity that *controls* a **Territory** (trains units, upgrades, declares war). May be a player, guild, alliance, or **NPC Kingdom**.
- **NPC Kingdom** — an AI-run faction that owns/controls territory and acts autonomously.
- **Guild / Alliance** — player organizations that can hold governorship and diplomacy.
- **Wild Monster / Boss** — PvE creatures; **bosses occupy WILD estates** and must be defeated to tame
  them (`05-pve-integration.md`). The world is a fantasy setting.
- **Pet** — element-aligned helper species (Pokémon-flavored) that occupy territories/zones by
  element and assist their controller (❓ OPEN: full species list & mechanics — char list incoming).

### World
- **World** — the persistent shard. One authoritative simulation.
- **Region** — a named cluster of territories (e.g. an archipelago).
- **Territory** — a controllable land or sea zone; **1 Territory = 1 Land NFT**. Has a **ZoneType**. Spans 1 hex (smallest parcel) up to ~10,000 hexes.
- **Estate** — a large multi-hex Territory (hundreds–10,000 hexes). Only estates have pre-designed castle/city-wall battle maps; estate sieges are fought as linked hex-sized components with an internal front (see `04` §7b).
- **Hex** — the atomic map cell. Territories occupy one or more hexes. Movement is hex-to-hex.
- **ZoneType** — `VILLAGE | TOWN | FORTRESS | HARBOR | CAPITAL | WILD | SEA`.
- **Node** — a point of interest on a hex (e.g. a resource node, a port, a shrine).
- **Route** — a traversable connection (road / sea lane) with a movement-cost weight.

### Resources (see `02-economy.md`)
- **CT (Carat)** — the single hard currency. Build, train, upgrade, repair, trade. On-chain settleable.
- **Food** — agricultural output. Consumed by population growth and army upkeep. Shortage → desertion, rebellion, tax loss.
- **Population** — drives tax, workers, and soldier capacity. Can die (pillage/starvation) or rebel.
- **Prosperity** — a 0–100 health score of a territory; scales all yields and Land NFT rewards.
- **Tax** — CT income skimmed from prosperity; split between Governor and Landlord.
- **Morale** — 0–100 per army and per territory; low morale causes combat penalties and desertion.
- **Supply** — an army's logistical stock; depletes with distance from friendly supply source.

### Development tracks (per territory)
- **Agriculture** (food), **Economy** (CT/tax), **Defense** (siege bonuses), **Military** (troop capacity).

### Military
- **Army** — a stack of **Units** led by a **Hero** (officer). Moves on the map, consumes **Supply** and **Food**.
- **Unit** — an abstracted troop group (NPC soldiers) with a **UnitClass** and veterancy.
- **Supply Train** — a logistics element extending an army's supply range; a raid target.

### Battle
- **Battle Instance** — a scheduled combat spawned when opposing forces meet. Types: `FIELD | SIEGE | NAVAL`.
- **Resolution Mode** — `AUTO` (AI-simulated), `LIVE` (players drop in via EF MOBA), `ACCELERATED` (fast-forward sim).
- **War Score** — the aggregate that decides a Battle Instance outcome and its map consequences.

### Actions
- **Pillage** — post-victory: large instant CT/loot, destroys infrastructure & population.
- **Occupy (Seize)** — post-victory: small instant reward, gain the territory's ongoing yield & position.

---

## Canonical constants (excerpt)

Full list in [`08-data-models.md`](./08-data-models.md). These are referenced everywhere:

```
HERO_IMPACT_MAX          = 0.20     // hero can swing at most 20% of combat power
TICK_SECONDS             = 60       // world simulation tick length (1 min)
TRAVEL_ADJACENT_MIN      = 15       // minutes, adjacent land hex, baseline route
TRAVEL_REGION_HOURS      = 3        // cross-region march, baseline
TRAVEL_OCEAN_HOURS       = 12       // trans-ocean crossing, baseline
PROSPERITY_MIN           = 0
PROSPERITY_MAX           = 100
MORALE_MIN               = 0
MORALE_MAX               = 100
LAUNCH_NPC_TERRITORY_PCT = 0.95     // 95% NPC-owned at world launch
SUPPLY_BREAK_PENALTY     = 0.35     // combat power lost when supply is cut
```

---

## Contributing / editing this bible

- **One canon.** Terminology and schemas live in this README and `08-data-models.md`. Change them there first.
- **Cross-link, don't duplicate.** Reference other docs by relative link instead of restating rules.
- **Every rule needs a number.** Prefer explicit constants and formulas over prose.
- **Mark open questions** with `> ❓ OPEN:` blocks so agents don't invent answers.
- **Keep the North Star.** If a proposal makes an individual battle matter more than the map, reject it.
