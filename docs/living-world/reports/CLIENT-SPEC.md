# Client hand-off spec (generated)

`tools/living-world/client_spec.mjs` builds this from the live functions: each surface's producing function, the field shape inferred over real samples (`?` = optional), and one sample. A test regenerates it, so it always matches the code. All copy comes from `i18n/<lang>.json`, and every function is deterministic, so the client can cache by its inputs.

## Event board row

Producer: `event_board.mjs boardAt(seed, zone, tick, view) → { live: Row[], upcoming: Row[] }` (12 samples merged)

```ts
type board_row = {
  at: string
  banner?: string
  closes: number
  distU: null | number
  form?: number
  id: string
  inMin: number
  kind: string
  opens: number
  ping: boolean
  postedAt: number
  potCT: number
  src: string
  state: string
}
```

Sample:

```json
{
 "id": "BUS|0|post4",
 "src": "PLAYER",
 "kind": "BOUNTY",
 "at": "5000529#0",
 "postedAt": 196,
 "opens": 318,
 "closes": 1278,
 "potCT": 7.5,
 "state": "LIVE",
 "inMin": 0,
 "distU": 71.4,
 "ping": false
}
```

## Region feed headline

Producer: `region_feed.mjs regionFeed(items) → { zone: { day: Headline[] } }` (49 samples merged)

```ts
type feed_item = {
  icon: string
  id: string
  kind: string
  score: number
  text: string
  tick: number
}
```

Sample:

```json
{
 "id": "cf-world-1|0|BUS-KEEP-DUNEWATCH|6",
 "tick": 140,
 "kind": "GUARDIAN_HELD",
 "score": 6,
 "icon": "🛡",
 "text": "The Ember Oath broke on the Ascendant of Dunewatch Light"
}
```

## Personal journal line

Producer: `journal.mjs journalEntry({ kind, k, won, nth, mult, reward, planted, at, home, lang })` (2 samples merged)

```ts
type journal_entry = {
  fresh: boolean
  text: string
}
```

Sample:

```json
{
 "fresh": true,
 "text": "Cleared the wild lair 11 u north-east of home, and planted your banner (+10)"
}
```

## Guardian challenge (board row + wake banner)

Producer: `stationings.mjs challengeRow(stationing, tick)` (2 samples merged)

```ts
type guardian_banner = {
  at: string
  banner: string
  closes: number
  form: number
  id: string
  kind: string
  opens: number
  postedAt: number
  potCT: number
  src: string
}
```

Sample:

```json
{
 "id": "gc|BUS-FORT-TIDEGATE:GUARDIAN_PERCH:1|465",
 "src": "AUTO",
 "kind": "GUARDIAN_CHALLENGE",
 "at": "BUS-FORT-TIDEGATE:GUARDIAN_PERCH:1",
 "postedAt": 465,
 "opens": 465,
 "closes": 825,
 "potCT": 4.5,
 "form": 3,
 "banner": "⚠ the Ascendant of Fort Tidegate stands for 1 h 45 m: 8 min of power from first contact, 3 Ward Stones"
}
```

## Ambient ship / airship position

Producer: `ambient_traffic.mjs shipsAt(seed, tick) → Ship[]` (166 samples merged)

```ts
type ship = {
  at?: number[]
  heading: string
  id: string
  kind: string
  lane: string
  status: string
  t: number
  zone?: string
}
```

Sample:

```json
{
 "id": "SEA:BUS-HARBOUR~BUS-PORT-CAPEMEET#0",
 "kind": "SEA_SHIP",
 "lane": "SEA:BUS-HARBOUR~BUS-PORT-CAPEMEET",
 "status": "SAILING",
 "t": 0.13,
 "heading": "BUS-HARBOUR",
 "zone": "BUS",
 "at": [
  121.7,
  65.7
 ]
}
```

## Arrival marker (naval landing / airship drop)

Producer: `arrivals.mjs resolveArrival(mapId, event, battleSeed)` (2 samples merged)

```ts
type arrival = {
  eligible: boolean
  spawn: {
    approachId: string
    x: number
    z: number
  }
  target: {
    anchorId: string
    x: number
    z: number
  }
  via: string
}
```

Sample:

```json
{
 "eligible": true,
 "via": "NAVAL_APPROACH",
 "spawn": {
  "approachId": "naval_0",
  "x": -2,
  "z": 124
 },
 "target": {
  "anchorId": "pier_0",
  "x": 16,
  "z": 122
 }
}
```

## Season beat (calendar strip + banner)

Producer: `season_beats.mjs beats(seed, cycle)[zone] + i18n beat.* copy` (8 samples merged)

```ts
type season_beat = {
  banner: string
  beat: string
  boss?: string
  day: number
}
```

Sample:

```json
{
 "day": 4,
 "beat": "ASCENSION_NIGHT",
 "banner": "✦ Ascension night in Porthaven: a Form 3 Guardian rises."
}
```

## Region influence panel

Producer: `influence.mjs regionInfluence(held, regionTotal)` (2 samples merged)

```ts
type influence = {
  held: number
  next: {
    at: number
    need: number
    unlock: string
  }
  unlocks: string[]
}
```

Sample:

```json
{
 "held": 4,
 "unlocks": [
  "POST_EVENTS"
 ],
 "next": {
  "unlock": "HARBOUR_RIGHTS",
  "at": 5,
  "need": 1
 }
}
```

## Help tip (i18n tip.*, numbers bound to live data)

Producer: `tips.mjs tips(lang) → { key: text }` (12 samples merged)

```ts
type help_tip = {
  key: string
  text: string
}
```

Sample:

```json
{
 "key": "tip.antiFarm",
 "text": "🔁 Clearing the same place again within 24 h pays less each time (×0.6, ×0.3, then ×0.1). Somewhere new always pays in full."
}
```

## Battle result screen (effects)

Producer: `resolve_result.mjs resolveResult(world, alloc, callback) → effects[]` (8 samples merged)

```ts
type battle_result = {
  burned?: boolean
  castleId?: string
  casualties?: {
    INFANTRY: number
    SIEGE: number
  }
  chooser?: string
  ct?: number
  heroImpact?: number
  kind: string
  mult?: number
  nth?: number
  options?: string[]
  retrainCT?: number
  rewardPoints?: number
}
```

Sample:

```json
{
 "kind": "ATTACKER_LOSSES",
 "casualties": {
  "INFANTRY": 540,
  "SIEGE": 270
 },
 "retrainCT": 37.8
}
```
