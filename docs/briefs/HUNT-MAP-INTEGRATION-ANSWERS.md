# Hunt × CF map integration — Agent D's answers to the 6 questions (2026-07-11)

> Answers to the CF Hunt agent's integration questions. **The shipped field data is the source of
> truth** (our cross-game rule); where the atlas disagreed, the field wins and the atlas is the error.

## Q1 — the Dominus conflict → **CONFIRMED (your re-ruling is correct)**

The field data is unambiguous: **the Bastion of Dominus is in UW2 Blackmere** —
`UW2-BASTION-DOMINUS` (PALACE, estate 1101100) + the `bastion_dominus` singular POI @[69.9,75] =
*"the dead keep on its own island in the Mere of Dominus… Seat of the Shadow Warden; its throne is
still warm."* The atlas's "Yomi no Tō = Isle of Dominus in UW3" is the error — **the Isle of Dominus
is the Bastion's island in UW2's Mere of Dominus.**

- **EP5 (Ayume taken) = the Bastion of Dominus (UW2)** — the Power realm holding her, exactly right;
  Kage's seat, "throne still warm" (he's gone deeper).
- **EP7 climax / the Yomi-no-Tō role = the Vault-Palace of Luxuria (UW3)** — `UW3-VAULT-STAGE`
  ("The Final Vault of Luxuria", BOSS_STAGE) + the Magma Throne. Matches "Luxuria = the finish" and
  "end-game Vault-stage boss revisit = returning to where you fought Kage." The Vault-Palace is
  **playable today** (heroParcels[0] = `61100870136`).

## Q2 — the throne → **MERGE (one throne)**

The field has exactly ONE throne: `UW3-THRONE-POI` "The Magma Throne" @[31.6,32]. Treat OVA2's "onyx
throne" and it as the **same object** — onyx stone over magma light reads beautifully, and at the
Diminution 1/6 scale (UW3 `charScale` visual 0.167) it's colossal. **The room you free her in is the
room she takes.** No second throne in the data; don't invent one.

## Q3 — the Tianxia portal → **it's the SHAFT (no new portal; now formalized in data)**

Confirmed, and I made it real: **`HUB-SHAFT`** (the Shaft of Tianxia, `the_shaft` singular) now
carries **`connects:["HUB","UW1"]`** + `warden:"the Shaft-Guardian"`. The Hunt cycle-2+ shortcut =
**descend the Shaft with the freight** (Tianxia → Ironhold UW1 → UW2 → UW3, the industrial army road,
boss-gated). No separate Tianxia↔Blackmere portal is authored or needed. This keeps zoneLinks' "the
Stair is **Mythoria's** only depth link" TRUE — the Stair is Mythoria's one-soul route; the Shaft is
**Tianxia's** freight route (different zone, no contradiction). Thematically superior, costs nothing,
and the Shaft already existed. Note: the Shaft lands in **UW1 Ironhold**, not directly UW2 — cycle-2
civilians ride down to Ironhold, then proceed to Blackmere; "the industrial way, with the freight."

## Q4 — the UW3 Houses → **YES, map the episodes on them (all playable today)**

The four Houses are real, KEEP-class, and **each has heroParcels (playable maps today)**: House of
Mirrors (`61100890117`), Silk (`61100880181`), Hunger (`61100840037`), Coin (`61100860055`). Your
reading is exactly the design intent — the desire realms in miniature:
- **House of Silk = Lust · House of Hunger = Gluttony · House of Coin = Greed · House of Mirrors =
  self-confrontation** (your Colour River). Map **EP4's Colour River vision → House of Mirrors** at the
  UW3 revisit; keep Feastfall/Midas as UW2 beats. Free level design — approved, they're built and
  playable.

## Q5 — travel canon → **every SEA_PORT pair is a legal voyage leg (your recommendation)** + ⚠ update

For the post-return open world: **yes — treat any `SEA_PORT`↔`SEA_PORT` as a legal voyage leg** (the
voyage dealer rolls the hand). `docs/maps/OVERWORLD-CONNECTIONS.md` §2 lists the *featured* lanes
(geography-based) but does not restrict Hunt — no rigid locked list needed. FFIV rule holds (airships
= the only way up).

⚠ **The airship links changed (owner-locked 2026-07-11 — update your travel canon):** it is NO LONGER
EDU↔HS3 / BUS↔HS3. It is now **surface → Aeropolis (HS1) the gateway → HS2 → HS3 (Empyrea, the
pinnacle)** — a tiered climb mirroring the underworld descent. Arcadia and Porthaven both airship to
**HS1** (Skyreach Anchorage = Porthaven's end). HS2→HS3 is the **War of the Sky Throne** (Emberfall =
fallen angels, UW-corrupted, besieging Empyrea). See `zoneLinks` + OVERWORLD-CONNECTIONS §3.

## Q6 — Blackmere→Luxuria crossing → **CONFIRMED (the Vault Gate opens onto the mist-sea)**

Elegant and topology-safe. CF only requires that `UW2-GATE-UW3` @[148.5,76] connects to
`UW3-GATE-UW2` @[1.2,32] — **how** you traverse the pass is Hunt's presentation. So: **the Vault Gate
is the door; behind it the crossing is your mist-sea voyage with the Kraken** — you sail to Luxuria's
far shore inside the pass. Fits UW2's nature (flooded caverns / black lakes — water is everywhere).
CF's topology is untouched.

**Two Krakens, by water (owner 2026-07-11):** a Kraken belongs to the sea, so give the guardian a
biome variant —
- **Lava Kraken** — the UW crossing into Luxuria: the Vault-Gate mist-sea runs into the magma light of
  UW3 (this pass borders the Inferno Vault / Magma Throne), so the guardian is a **molten/obsidian
  Kraken** rising from lava-lit black water. Fits the UW3 VOLCANIC palette (`magma:true` waters).
- **(regular) Kraken** — the SURFACE sea lanes (§Q5, the SEA_PORT voyage legs): an ordinary
  deep-water Kraken haunts the open ocean between coastal ports.

Same creature archetype, two skins keyed to the water it lurks in — a clean reuse of your travel-
encounter system, and it reinforces the sky/underworld mirror (blue seas above, lava seas below).

---
**Data changes I made for these:** `HUB-SHAFT` gains `connects:["HUB","UW1"]` + warden (Q3);
HUB.json regenerated byte-stable; hero_parcels 34/34 green. Everything else was confirm-only (the
field already supported it). Atlas reconciliations to relay to the lore session: Isle of Dominus =
UW2 (not UW3); Yomi-no-Tō climax role = the UW3 Vault-Palace.
