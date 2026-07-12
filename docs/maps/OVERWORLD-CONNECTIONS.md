# Overworld connections + key-POI legend — the authoritative source for the CF world map

> **Agent D (CF ParcelMap Design), 2026-07-11.** THE definitive list of inter-continent connect points
> + the iconic destinations to mark. The CF overworld map must match THIS — it is derived from the
> committed world fields (`data/world-terrain/*.json` POIs) + `data/zone-registry.json` `zoneLinks`,
> not hand-placed. **If the live overworld disagrees with this doc, the live overworld is wrong.**
>
> Coordinates are **zone-local** (the POI's `at` in its field's coords). To place on the world map, the
> overworld adds the zone's `worldOffset` (registry). What matters for drawing a route: the **anchor
> POI on each end** — draw the line between those two anchors, nothing else.

## 0. The ONE principle

**Tianxia (HUB) is the hub — "all roads lead here."** The three starter continents each border Tianxia
by a **river-gate** (a land/river crossing), and NOT directly to each other by land. Everything else is
sea lanes (ports), airship ways (to the sky — **always via the Aeropolis/HS1 gateway**, §3), the secret
Stair, and the boss-gated descent.

## 1. SURFACE land/river borders — the 3 starter↔Tianxia crossings (DATA-CONFIRMED)

Each is a real river flowing across the shared frontier; the overworld draws a **land bridge / river
crossing** (not a dashed sea/air lane) between the paired gate anchors.

| Route | Anchor A (zone-local) | Anchor B | The river |
|---|---|---|---|
| **Arcadia ↔ Tianxia** | `EDU-GATE-N` @[63,0] | `HUB-GATE-S` @[164,230] | the Arcadia Flow → the Tianhe |
| **Porthaven ↔ Tianxia** | `BUS-GATE-S` @[130,241] (+ `BUS-GATE-SB` @[170,241]) | `HUB-GATE-N` @[170,3] | the Tianhe → the Broadwater delta |
| **Mythoria ↔ Tianxia** | `ENT-GATE-E` @[290,171] | `HUB-GATE-W` @[3,161] | the Xijiang → the Mirthwater |

The starters do **not** border each other by land — a march between Arcadia, Porthaven, or Mythoria
passes **through Tianxia** (or goes by sea). `*-GATE-N/NW/E/SE` marked `connects:["<self>"]` are
"beyond-the-frontier" stubs (disabled-zone edges) — **do not draw them as routes.**

## 2. SEA lanes — coastal ports (boat travel; the anchor icons on the live map)

Ports exist in the fields; the specific inter-continent **sea lanes** are the overworld's to draw
between these port anchors. Recommended lanes by geography + the "joined oceans" (atlas §7: BUS's north
coast meets ENT's west coast at the NW):

| Sea lane | Port A | Port B |
|---|---|---|
| **Porthaven ↔ Mythoria** (the joined oceans) | `BUS-PORT-CAPEMEET` @[11,25] | `ENT-PORT-PETALPORT` @[19,21] |
| **Porthaven ↔ Olympus** (isle in the bay) | `BUS-HARBOUR` @[138,72] | `CGI-LANDING` @[20,42] |
| **Mythoria ↔ Fortuna** (isle in the bay) | `ENT-MARINA` @[14,452] | `KOL-HARBOUR` @[44,77] |
| **Porthaven ↔ Fortuna** | `BUS-PORT-EASTREACH` @[341,125] | `KOL-HARBOUR` @[44,77] |

Porthaven's other quays (`BUS-PORT-MIDDLEQUAY`, `BUS-HARBOUR`=the First Dock) and Mythoria's resort
quays (`ENT-PORT-LANTERNSHORE`, `ENT-PORT-SUNSTRAND`) are **local ports** (intra-continent / flavor) —
mark them as ports, not necessarily as inter-continent lanes. The prestige isles **Olympus (CGI)** and
**Fortuna (KOL)** are reachable by sea (these ports) AND air (their skydocks, §3) — never by land.

## 3. AIRSHIP ways — the TIERED CLIMB to heaven (owner-LOCKED 2026-07-11; the FF-IV flying ships)

**Aeropolis (HS1) is the GATE TO HEAVEN** — every surface airship lands there FIRST. From the gateway
you **BRANCH to ONE of HS2 or HS3** (player's choice). The two upper isles are **AT WAR and have NO
direct link** — you reach each only *through* the gateway and pick a side at the gate. There is **no
surface→HS2/HS3 direct route.**

| Airship way | From anchor | To anchor | Note |
|---|---|---|---|
| **Arcadia → Aeropolis (HS1)** | EDU airship dock ⚠ *owes an `EDU-PORT-SKY` POI* | HS1 Gateway Anchorage (`gateway_dock`; field unbuilt) | surface → the gateway |
| **Porthaven → Aeropolis (HS1)** | `BUS-PORT-SKY` @[296,178] (Skyreach) | HS1 Gateway Anchorage | surface → the gateway |
| **Aeropolis → Emberfall (HS1→HS2)** | HS1 | HS2 (field unbuilt) | branch A (the fallen-angel side) |
| **Aeropolis → Empyrea (HS1→HS3)** | HS1 | HS3 (field unbuilt) | branch B (the pinnacle) |

**❌ NO `HS2 ↔ HS3` edge — the War of the Sky Throne severs it.** **Emberfall (HS2) = the FALLEN
ANGELS** (Ember*fall* — the name is the tell), corrupted out of the underworld, returned to heaven to
**claim the throne** — besieging **Empyrea (HS3)**, the rightful pinnacle. The war is a **status flag
on the two isles** (`zoneLinks.skyWar`: belligerents HS2, HS3), **not a traversable route** — do NOT
draw a HS2↔HS3 line. From the Aeropolis gate the player chooses their side of the war.

**Mirror-with-variation of the underworld:** the underworld is a **LINEAR** descent
`(Shaft) HUB → UW1 → UW2 → UW3` (Luxuria deepest, boss-gated); the sky **BRANCHES** at the gateway
(HS1 → HS2 | HS3, war-split). Both are gated tiers, but the shapes differ on purpose (owner:
*"intentional variation of UW rules"*) — and the corruption that sank into the deep now rises to
besiege the height.

Tianxia has an airship berth (`HUB-PORT-SKY` @[305,64], Yong'an Sky Dock) but **no route is defined
from it** — do not draw one unless the owner adds it. The prestige isles' skydocks (`CGI-SKYDOCK`,
`KOL-SKYDOCK`) are how **Olympus/Fortuna** are reached by air (they are NOT part of the sky climb —
they sit in the surface bay).

⚠ **Fix the live map:** it routes surface→HS3 (or Aeropolis↔Arcadia loosely) — replace with the chain
above: **surface → HS1, then HS1 → (HS2 OR HS3)** — gateway first; NO HS2↔HS3 link (war-severed).

## 4. The SECRET Stair — Mythoria → Blackmere (DATA-CONFIRMED; NOT a public route)

| Route | Upper mouth | Lower mouth |
|---|---|---|
| **Mythoria (ENT) → Blackmere (UW2)** | `ENT-STAIR-DIMINISHING` @[21,449] | `UW2-STAIR-FOOT` @[17,46] |

The Diminishing Stair: single-file, one soul at a time, **never an army**. **Do NOT draw it as a public
dashed route** on the overworld — surface it only as lore/discovery (`secret:true` in `zoneLinks`).

## 5. The DESCENT chain — the army route down (boss-gated)

| Gate | From → To | Anchor | Lore |
|---|---|---|---|
| **The Shaft of Tianxia** | Tianxia (HUB) → Ironhold (UW1) | ⚠ *the Shaft is a singular in HUB center; owes a `HUB-GATE-SHAFT`→UW1 POI* | the only army road down |
| **Blackmere's Gate** (2nd lock) | Ironhold (UW1) ↔ Blackmere (UW2) | `UW2-GATE-UW1` @[2,76] | warden: the Lake That Watches |
| **The Vault Gate** | Blackmere (UW2) ↔ Luxuria (UW3) | `UW2-GATE-UW3` @[149,76] ↔ `UW3-GATE-UW2` @[1,32] | to the Inferno Vault |

Underworld is a **linear descent** (HUB Shaft → UW1 → UW2 → UW3), boss-gated at each level. The Stair
(§4) is the solo shortcut into the middle of it (UW2), bypassing UW1.

## 6. What the LIVE overworld gets wrong (fix list)

1. **Airship routes (§3, owner-LOCKED):** surface airships go **Arcadia → HS1** and **Porthaven → HS1**
   (the Aeropolis gateway) — NOT surface→HS3 direct. From HS1 they branch to **HS2 OR HS3**. There is
   **no HS2↔HS3 route** (war-severed). Fix the live map to this.
2. **Verify every sea-lane anchor** lands on a real `SEA_PORT` POI from §2 — not an arbitrary coast
   point.
3. **The Stair must not appear as a public route** (§4).
4. **Starters must not border each other by land** (§1) — only via Tianxia or by sea.

## 7. KEY-POI LEGEND — the iconic destinations to mark (numbered; icons owner's choice)

Mark these on the overworld with an icon + number keyed to this legend (they are the world-codex
singulars + capitals — `data/singulars.json`, the castles/POIs in the fields). ★ = a `heroParcels`
hero-mode destination or a committed estate map (playable today).

| # | Destination | Zone | Field POI / singular | Icon idea |
|---|---|---|---|---|
| 1 | **The Shaft of Tianxia** ★ | HUB | `the_shaft` (HUB center) | ⛓ the descent maw |
| 2 | **The Vermilion Palace (Zhongdu)** ★ | HUB | `HUB-PALACE-ZHONGDU` (estate map 1071732) | 🏯 imperial palace |
| 3 | **The Grand Academy** ★ | EDU | `grand_academy` (estate map 1020371) | 🎓 academy |
| 4 | **Westgate Castle** ★ | EDU | `EDU-CASTLE-WESTGATE` (60203670103) | 🏰 castle |
| 5 | **The Scholar's Gap** | EDU | `gap_of_arcadia` (EDU-GATE-GAP) | ⛰ mountain pass |
| 6 | **The Grand Exchange / First Dock** ★ | BUS | `BUS-PALACE-EXCHANGE` (1001178) / `first_dock` | ⚓ grand harbour |
| 7 | **Fort Tidegate** ★ | BUS | `BUS-FORT-TIDEGATE` (60011440099) | ⭐ star-fort |
| 8 | **Skyreach Anchorage** | BUS | `BUS-PORT-SKY` | 🎈 airship dock |
| 9 | **Carnavale / The Palace of Masks** ★ | ENT | `carnavale` / `ENT-PALACE-MASKS` (1031491) | 🎭 carnival |
| 10 | **The Lady of Tides** | ENT | `ENT-LADY` (the Corcovado statue) | 🗽 colossal statue |
| 11 | **The Diminishing Stair** (secret) | ENT→UW2 | `ENT-STAIR-DIMINISHING` | 🌀 hidden stair (discovery only) |
| 12 | **The Bastion of Dominus** ★ | UW2 | `bastion_dominus` (estate map 1101100) | 💀 dead keep |
| 13 | **The Drowned Banquet** | UW2 | `drowned_banquet` | 🍷 flooded halls |
| 14 | **The Gardens of Enamora** | UW3 | `gardens_enamora` | 🌹 twilight garden |
| 15 | **The Vault-Palace / Inferno Champion** ★ | UW3 | `UW3-VAULT-STAGE` (61100870136) | 🔥 final vault |
| 16 | **Olympus (founders' isle)** | CGI | `CGI-*` (Port Olympus / Skydock) | 💎 prestige isle |
| 17 | **Fortuna (influencers' isle)** | KOL | `KOL-*` (Port de Fortune / Skydock) | 🎰 prestige isle |

(Sky isles HS1–3 + Ironhold UW1 destinations get their legend rows when those fields are built.)

## 8. Machine-readable

Everything here traces to: `data/world-terrain/<ZONE>.json` `pois[]` (the `connects[]` + `at`),
`data/zone-registry.json` `zoneLinks` (the inter-zone routes) + `_meta.charScale` (Diminution) +
`worldOffset` (world placement), and `data/singulars.json` (the codex names). The overworld should
**read these**, not hardcode. A future `data/overworld-connections.json` (this doc as data) can be
emitted on request.
