# EF HUNT → "BEYOND THE TWILIGHT VEIL" — Story Pivot Master Plan

> A full planning document for re-building EF HUNT (`pve.html`) from a story-light grind loop
> into a **story-driven, episodic dark-fantasy ARPG** adapted from the *Beyond the Twilight Veil*
> treatment, script, and Underworld rules (the three uploaded docs). The user owns the story &
> plans; this document turns them into a concrete game design that reuses everything we've already
> built. **Nothing is coded yet** — this is the blueprint to review and direct from.

---

## 0. The one-paragraph pitch

You are **Kai (Jiro)**, drawn with your closest companion **Leah (Ayume)** into a carnival that is a
doorway to the **Underworld** — a realm sculpted from human desire. To follow Leah through a guarded
portal you take up a living scimitar that brands you with shadow-sigils. Across seven episodes you
descend through realms of Greed, Gluttony, Power and Lust, gaining shadow power at the cost of your
**Humanity**, joined and tempted by the fox-masked **Irene (Yui)**. But the love story is a trap:
**Leah is the architect of the whole descent.** She orchestrated your meeting, the pact, and the fall
— and in the end she takes the dark throne, sacrifices Irene, and binds you to her will. The game is
about chasing love into the dark and discovering the dark was the point.

---

## 1. What changes, what stays (the pivot in one table)

| Layer | EF Hunt (now) | Beyond the Twilight Veil (pivot) |
|---|---|---|
| Frame story | Sundering / Etherheart / Hollow King | The Underworld of Desire; carnival → descent; Kage no Mamoru |
| Player | Pick 1 of 3 daily heroes | **Always Kai (Jiro)**; Leah & Irene *join as the story unlocks them* |
| Structure | Jump into any zone, grind to clear | **Linear 7-episode campaign** laid over the zones; free-roam unlocks after |
| Why you fight | Reclaim shards | Rescue Leah → uncover the betrayal → survive your own corruption |
| Companions | Tamed pets | Pets stay, **+ Leah/Irene as story party members** who fight *with or against* you |
| Death | Permadeath / injured / Blight | **Reframed as Corruption** — losing yourself to the Veil (mechanics below) |
| Zones | 7 elemental realms | Re-skinned to **Carnival hub + 4 Sin-Realms + dream stages + Castle of Shadows** |
| Bosses (Wardens) | Mossfang/Pyrelord/… | **Realm-lords of sin** + **Kage no Mamoru** (final) + **Ayume** (the true final) |
| Currency CT (on-chain) | Carat | Kept as-is — in-fiction the **"Covet Crystal" essence**; freezable on-chain later |
| Anti-cheat "Blight" | Hollow Blight shadow-ban | Re-skinned as **"Consumed by the Veil"** (same hidden mechanic) |

**Keep all the engine work**: aim-then-cast skills (CORE kits), threat con-markers, monster
personality AI, per-Warden boss mechanics, zone/safe-start system, boss bar, CT economy, the
client anti-cheat, the model/calibration pipeline. We **re-theme and sequence** them under a story.

---

## 2. Characters (the heart of the pivot)

The three hero GLBs become the three leads. **Player starts with ONLY Kai.**

### Kai = **JIRO** — the player (Combat). 
Earnest, curious, in love with Leah. His arc is the tragedy: every shadow power he gains to save her
pulls him further from himself. Mechanically he's the only controllable hero; his **Corruption** is
the spine of the game. Kit re-skinned to **shadow/blade** (his Combat kit + unlockable shadow skills).

### Leah = **AYUME** — companion → **the secret antagonist** (Mystic).
Reads as the devoted partner. Joins your party in early episodes and fights **alongside** you. The
twist (seeded from Episode 1, paid off in the OVAs / finale): she found the *Scimitar's Secrets*,
made a pact, **needed a "fated partner"**, and engineered Kai's entire descent. In the climax she
takes the throne and turns the party against you. Her kit (Mystic) gets a dark second form.

### Irene = **YUI** — the temptress → the **tragic** one (Flyer).
Fox-masked, provocative, an "enigmatic agenda" — the audience suspects *her* of being the villain,
which is the misdirection. She joins after Episode 2, fights with you through the middle episodes,
and is **struck down / absorbed** in the betrayal. Sympathetic by the end.

### Supporting cast
- **The Fortune Teller** — Episode-1 prophecy-giver (the in-game tutorial/quest oracle; reuse Elder Varn's NPC slot, re-skinned).
- **Yume** — Episode-6 guide who gives the enchanted **compass** (a navigation/objective item) and human food (anchor items). A second friendly NPC.
- **Kage no Mamoru** — the shadow lord of the Castle; penultimate boss.
- **Whisper** — the disembodied dark voice that seduces (OVA flavour; in-game = the corruption "voice" that taunts as your gauge rises).

> **"Alongside or against" rule:** each episode declares the party stance. Companions are allied AI
> (escort/assist) in most episodes, become *unkillable cutscene actors* during rituals, and become
> **enemy AI** during the betrayal beats. We already have ally AI (pets) and enemy AI (monsters);
> a companion is a unit that can switch `team` by episode.

---

## 3. The Underworld rules → game mechanics (the "Desire Weave")

The rules doc is a gift — it maps cleanly onto systems we have or can add:

| Underworld rule | Game mechanic |
|---|---|
| **Desire Weave** — magic = your desire; each cast siphons life essence | Skills cost MP **and a sliver of Corruption** (or HP) — power has a price |
| **Principle of Equivalent Desire** — stronger desire = stronger magic | Optional: skill damage scales with current Corruption (risk = reward) |
| **Cost of Power / Consequences of Overuse** — overuse → consumed by the realm | **Corruption Gauge** (see §4). Past the Critical Limit = you lose yourself |
| **Covet Crystals** — store desire, amplify magic, corrupt if overused | Re-skin **gems/sockets**; over-socketing could nudge Corruption |
| **Anchors of Humanity** — items/memories that stabilise you | **Anchor items** (the plush night-creature, the compass, human food) lower Corruption |
| **Magic of Binding / Contracts** — blood pacts, unbreakable, cursed if broken | Story pacts (the scarf ritual); a gameplay **pact buff** with a downside |
| **Forbidden Magic** (necromancy, will-binding) | The shadow/Kage powers — strong but corruption-heavy |
| **Rule of Sacrifice** — big magic needs a sacrifice | Ultimate/“super” costs more than mana at high corruption |
| **Desire's Reflection** — the land mirrors your desires/fears | Each realm themed to a sin; the river-of-visions / nightmare-grove beats |

This is the throughline that makes the grind *mean* something: **every fight is a negotiation with
your own corruption.**

---

## 4. The Corruption system (merges permadeath + injury + the Blight into one themed spine)

Replace the abstract "injury/blight" framing with one diegetic meter, **HUMANITY ⇄ CORRUPTION**:

- A bar from **Humanity 100%** (top) to **Corruption 100%** (bottom). Starts mostly human.
- **Rises (toward Corruption)** when you: use shadow abilities, take the scimitar/forbidden powers,
  make "dark choices," over-use Covet Crystals, linger in deep realms.
- **Falls (toward Humanity)** when you: eat **human food / use anchors**, rest in the Carnival (the
  safe hub), make compassionate choices.
- **Power Threshold** (mid-bar): you must be corrupt *enough* to defeat Kage no Mamoru / hard bosses
  — pure-hearted Kai is too weak for the endgame. This forces the player to flirt with darkness.
- **Critical Limit** (near the bottom): cross it and **Kai is consumed → run over / loss-of-self**.
  This is our **permadeath**, re-themed: you don't just die, you *become the Underworld*. The existing
  paid-respawn / 24h-injured rules become "the Veil's grip" — pay to be pulled back, but you return
  *more corrupted* (injured = a permanent corruption residue for 24h; die again = consumed for good).
- **Shadow abilities unlock as Corruption rises** (Episode 7's design) — a real risk/reward kit that
  grows more monstrous, with Kai's model visibly darkening (we already desaturate the model for the
  Blight — reuse that, scaled to the gauge).
- **Anti-cheat** stays as the hidden integrity flag, now flavoured as being **"Consumed by the Veil"**
  — a permanent, disguised corrupted state (0 damage, no rewards). Same code, better fiction.

> This single system absorbs three things we already built and gives them story weight. It is the
> most important mechanical decision in the pivot.

---

## 5. Zones → story settings (keep the maps, re-skin + sequence them)

We keep the 7-zone world but **rename and reorder** them as story stages. The 4 named Sin-Realms are
the spine; the dream/garden/castle beats reuse remaining zones.

| Episode setting | Uses (existing zone) | Re-skin |
|---|---|---|
| **The Carnival** (hub) | Emberhollow town + the Wilds | Night carnival: stalls, masquerade grove, fortune tent, altar+portal. The **safe hub** (lowers Corruption). |
| **Garden of Whispers** (dream) | a low-tier dungeon zone | Shrunken giant-world + crystal glade + river of visions |
| **Grove of Nightmares** | a mid zone | Ethereal dance → blood-red nightmare, color-blooms, creature swarm |
| **Realm of Greed/Wealth** (Valley of Midas) | Cinderpeak slot, re-skinned gold | Streets of gold, spirits entranced by wealth |
| **Domain of Gluttony** (Feastfall Plains) | Frostmere slot, re-skinned feast | Endless banquet, hunger-storms |
| **Bastion of Power** (Isle of Dominus) | Stormspire slot | Floating arenas, fortresses, static air |
| **Gardens of Lust** (Enamora) | Ironroot slot, re-skinned | Perpetual-twilight seductive garden |
| **Castle of Shadows** (Yomi no Tō) | Abyssal Vault (final) | Kage no Mamoru's throne — the finale |

Free-roam / endless grind (the current "jump into any zone") **unlocks after the campaign** as
"Echoes of the Veil," so the systems we built keep their value as the post-story loop.

---

## 6. The seven episodes as playable stages

Each episode = a **stage** with: an **intro dialogue/cutscene**, a **party stance** (with/against),
the **signature gamified beat adapted WITHOUT VR**, **combat conversion** (the user wants most
elements turned into battles), and a **secret/foreshadow** seed. Episodes gate linearly (finish one
to unlock the next); replaying a finished episode is allowed for grind.

> **No-VR adaptation principle:** the VR docs use "grab/throw/trace with controllers." We map those
> to the engine we have — **aim-then-cast clicks, walk-over pickups, click-sequences, and combat
> waves**. Where the user says "turn elements into battles," the puzzle becomes a fight *gated by* a
> light interaction.

### Episode 1 — "Carnival"  (tutorial; party: Leah **with** you, non-combat)
- **Intro:** opening wagon ride dialogue (Kai + Leah), arrival cutscene. First-ever-launch only.
- **Beat → game:** the **bottle-knockdown** becomes the **combat tutorial** — three rounds of
  throw/aim at targets teach **aim-then-cast** (arm → click). Round 3 "heavier bottles" = first
  weak enemies. Win → the **plush night-creature** = your first **Anchor item** (lowers Corruption).
- **Fortune Teller:** the prophecy cutscene = the quest-oracle tutorial (replaces Elder Varn). Seeds
  the whole arc; the "beware the allure of power" line literally explains the Corruption gauge.
- **Secret:** the fortune teller's cards subtly foreshadow Leah's betrayal (a card the player only
  understands on replay).

### Episode 2 — "Masquerade"  (party: Leah with you → separated; introduce Irene)
- **Intro:** puppet stall + masquerade grove dialogue.
- **Beat → game:** **Mask Collection** = a 5-pickup **exploration quest** in the grove (walk-over
  collectibles with a HUD counter — we already have egg/drop pickups + a counter pattern). The
  **crowd-surge separation** is scripted; **grotesque dancers** become the first real enemy pack
  (combat conversion). The **fox mask** pickup triggers the **Irene** meeting + kiss cutscene.
- **End:** find Leah kneeling before Irene at the **altar + scimitar + guarded portal** (cliffhanger).
- **Secret:** Irene reads as the villain here (deliberate misdirection).

### Episode 3 — "The Rite of Blades"  (party: Leah & Irene **as actors**, then **against** the barrier)
- **Intro:** the blood-pact ritual cutscene ("Two can pass / One cannot pass"). Companions are
  scripted actors; the **plague-guardians** are a mini-boss gate.
- **Beat → game:** the **Sigil-Tracing** challenge, no-VR version = a **5-symbol click/drag
  sequence** (trace nodes in order, or a timed QWER/number sequence) as the scimitar brands Kai.
  Success = unlock the first **shadow skill** AND start the **Corruption gauge** at a low value.
  (Convert the "barrier" into a **fight** against the guardians to reach the altar, per the
  battle-conversion goal.)
- **End:** Kai steps through the portal — leaves the Carnival hub for the Underworld proper.
- **Secret:** the pact binds Leah & Irene (the scarf) — a contract that pays off in the betrayal.

### Episode 4 — "The Garden of Whispers"  (party: Irene **with** you; Leah absent)
- **Intro:** shrink/transform cutscene; giant world.
- **Beat → game:** **Size-Altering Elixirs** = a **sequence puzzle** (eat fruits in the right order
  to fit the door) — light, kept as a puzzle for variety. Then the **crystal glade + river of
  visions**: the river shows Kai the **vision of betrayal** (foreshadow cutscene — he's alone on a
  shadow battlefield, companions accusing). Garden fruit = a tempting buff with a Corruption cost.
- **Combat:** garden guardians / desire-spirits as the realm's pack.
- **Secret:** the river vision is the clearest pre-twist tell.

### Episode 5 — "Dance Macabre / Grove of Nightmares"  (party: Irene with you; **Leah captured**)
- **Intro:** ethereal dance → nightmare turn cutscene.
- **Beat → game:** **Color-Hungry Blooms** = a **timed sequence puzzle under enemy pressure** —
  activate crystals in the bloom's color order while the **creature swarm** chases (this is the
  clearest "puzzle becomes a battle": solve-while-fighting). **Leah is snatched** → the rescue goal.
- **End:** Kai + Irene shelter in a ruin; Kai blames Irene (relationship beat).
- **Secret:** Leah's "capture" is staged (revealed later) — she goes willingly to the throne.

### Episode 6 — "Shadows of the Self"  (party: Irene **distorted**; meet Yume)
- **Intro:** quake separates them; black tendrils on Kai's skin (Corruption made literal). Distorted
  Irene; meet **Yume**, who gives the **enchanted compass** (objective/navigation item) and **human
  food** (anchors).
- **Beat → game:** **Human Essence Balancing** = the **Corruption gauge management** mini-loop made
  explicit — choose foods (bread/fruit/meat/veg/sweets) to manage Humanity vs monster-attraction
  (meat lowers corruption a lot but draws enemies = risk/reward). This *is* the §4 system, taught.
- **Combat:** corrupted denizens; the compass points to the Castle.
- **Secret:** Yume's warnings about "Leah's fate" are double-edged.

### Episode 7 — "Kage no Mamoru"  (party: Irene with you → the betrayal)
- **Intro:** approach the Castle of Shadows; Corruption-gauge **Power Threshold** explained.
- **Beat → game:** **the boss gauntlet.** Monstrous encounters force escalating **shadow abilities**
  (each use fills Corruption toward the **Critical Limit**). **Kage no Mamoru** boss = a race to the
  **Power Threshold without crossing the Critical Limit** (we already have per-warden boss mechanics;
  this is the showcase). Rescue Leah from the crystal.
- **THE TWIST (OVA2 brought into the finale):** Leah takes the throne, Kage no Mamoru bows to her,
  **Irene is struck down/absorbed**, and **Leah turns the fight against Kai** — the **true final
  boss is Ayume.** Companions-as-enemies, fully realised. Ending: bittersweet, Kai corrupted.
- **Secret/payoff:** everything from Ep1 recontextualised.

### OVA 1 & OVA 2 — unlockable "found-footage" secrets
- Short, grainy unlockable cutscene reels (image/text slideshows in an overlay) that reveal **Leah's
  origin** (OVA1: the bookshop, the *Scimitar's Secrets*, Whisper, "she needs a fated partner") and
  the **throne betrayal** (OVA2). Unlocked by story milestones / collecting hidden "memory shards."
  These are how the player *discovers the secret* — optional depth, high payoff. Cheap to build
  (an overlay slideshow), huge narrative value.

---

## 7. New systems to build (beyond re-skinning)

1. **Dialogue / cutscene system** — a lightweight overlay that shows a portrait + speaker + line,
   advances on click, supports a sequence (and a "choice" variant for dark/light decisions feeding
   Corruption). Reused for: intro, per-episode intros/outros, NPC talks, OVAs. *Highest-priority new
   system — the pivot is "story overlay," and this is the overlay.*
2. **Episode / stage progression** — `SAVE.episode` (linear gate), a **stage-select / chapter** screen
   replacing or fronting the zone-select map, each chapter = setting + objective + party stance.
3. **Companion party members** — Leah/Irene as units that (a) fight allied, (b) act in scripted
   cutscenes, (c) flip to enemy team for betrayal fights. Build on existing ally/enemy AI + a
   `companion` flag and per-episode team assignment.
4. **Corruption gauge** (§4) — the merged Humanity/Corruption/permadeath spine + shadow-skill unlocks.
5. **Anchor items & human food** — consumables that lower Corruption; the plush, compass, food.
6. **A few signature mini-games** kept non-combat (sigil trace, size elixirs) + the rest converted to
   combat-gated beats.
7. **OVA/secret viewer** — an unlockable slideshow overlay for the found-footage reveals.
8. **Re-skin pass** — zone names/colors/props, boss names (Realm-lords + Kage no Mamoru + Ayume),
   hero kits (Kai shadow-blade), currency flavour, the Blight→"Consumed by the Veil."

---

## 8. How it sits on what's already built (reuse map)

- **Aim-then-cast + CORE kits** → Kai's blade/shadow kit; sigil unlock grants extra shadow skills.
- **Threat con-markers** → unchanged (still tells you what will kill you).
- **Monster personality AI** → the Underworld denizens; "desire's reflection" makes erratic moods fit.
- **Per-Warden boss mechanics** → the Realm-lords + Kage no Mamoru; Ayume gets a bespoke moveset.
- **Zone/safe-start/jump-in** → becomes chapter travel; safe pads = realm entrances; the Carnival hub
  is the master safe zone (lowers Corruption).
- **Boss bar + status HUD** → boss bar for Realm-lords/Kage/Ayume; status HUD shows Corruption tendrils.
- **Permadeath / injury / paid respawn** → re-themed as Corruption / the Veil's grip (§4).
- **Anti-cheat Blight** → "Consumed by the Veil" (same hidden code).
- **CT economy (on-chain)** → kept; "Covet Crystal essence"; freezable on-chain per your plan.
- **Faction rep / bestiary** → realm denizen lore + a "memories" codex that also tracks OVA unlocks.
- **Pets/taming** → kept as summoned desire-familiars (optional re-skin).

So the pivot is **~70% re-theme + sequencing of existing systems, ~30% new** (dialogue, episodes,
companions, corruption merge, OVA viewer).

---

## 9. Phased roadmap (proposed build order)

1. **Phase A — Narrative skeleton (no new combat):** dialogue/cutscene system + the **first-launch
   intro** (Kai + Leah, wagon→carnival) + the **Carnival hub re-skin** + fortune-teller oracle +
   `SAVE.episode` gating + a chapter-select screen. *Smallest slice that delivers "real story
   purpose" on launch.*
2. **Phase B — Corruption spine:** build the Humanity/Corruption gauge, fold in injury/permadeath,
   shadow-skill unlock, anchor items. Re-skin the Blight → "Consumed by the Veil."
3. **Phase C — Companions:** Leah/Irene as join-able party members with the with/against flag; wire
   the Episode-3 ritual + the Episode-7 betrayal boss (Ayume).
4. **Phase D — Episodes 1–7 content:** per-episode intro/outro dialogue, the gamified beat (combat or
   puzzle), realm re-skins, Realm-lords, Kage no Mamoru. Build front-to-back so each ships playable.
5. **Phase E — OVA/secret viewer + polish:** found-footage reveals, memory-shard collectibles, the
   replay/free-roam "Echoes of the Veil" endgame, balance, browser playtest.
6. **Throughout:** keep the **Definition-of-Done** (code + in-game guide + dev docs together) and the
   static-validation discipline; browser F12 remains the gate.

---

## 10. Open questions for you (so I plan the next pass precisely)

1. **Tone/rating:** the source has sensual/violent beats (kiss, blood pacts, lust realm). How
   PG/adult should the game be — suggestive-but-tasteful, or keep it sharper?
2. **Episode length:** the source is 7×5-min VR scenes. In-game, should each episode be a ~10–20 min
   stage (so the campaign is ~1–2 h), or longer grind-stages?
3. **Branching:** do the dark/light **choices** actually branch the ending (multiple endings), or is
   it a single authored tragedy with Corruption only affecting power/flavour?
4. **Keep the old grind?** Confirm we fold the existing 7-zone grind into post-campaign "Echoes of the
   Veil" rather than deleting it.
5. **Companion control:** should the player ever directly control Leah/Irene (e.g., a co-op or
   character-swap episode), or are they always AI allies/enemies with Kai as the only avatar?
6. **Art:** the 191 MB carnival doc is full of reference images — want me to extract key frames to a
   `refs/` folder to guide the re-skin colours/props, or keep it text-driven for now?

> Recommended starting point once you answer: **Phase A** (dialogue system + intro + Carnival hub +
> chapter gating). It's the smallest build that makes EF Hunt *feel* like the pivot the moment you
> launch it, and everything else hangs off the dialogue/episode scaffolding it creates.

---

## 11. Revision 1 (user) — naming, dialogue art, two worlds, co-op, Barkindle

Five additions that refine Phase A and the co-op design:

### 11.1 Player names their hero
- First launch shows **"What is your name, hero?"** → the player types a name (default **Kai**).
- Stored in `SAVE.heroName` (permanent). Used everywhere Kai is referenced — HUD, dialogue ("[NAME]"),
  the name-slice voice bark. **Ayume and Yui keep their fixed names** (only the avatar is renamed).
- In dialogue, the player character's lines are labelled with `SAVE.heroName`; everyone else fixed.

### 11.2 Dialogue with a full character image (the "creative dialogue system")
- A visual-novel-style overlay: a **large character portrait** on one side + a **name plate + text box**
  with click/▶ to advance, typewriter reveal, and optional speaker swap (left/right portraits for two-
  hander scenes). Supports a queue of lines and an end-callback (to trigger gameplay after a scene).
- **Art source options (in order of effort):** (a) extract character frames from the 191 MB carnival
  doc into `refs/` and use those as portraits; (b) stylised placeholder portraits (framed silhouettes
  tinted to each character) until real art lands; (c) render the 3D hero GLB to a portrait. *Plan:
  ship with (b) placeholders so the system works now, swap to (a) art when extracted.*

### 11.3 Two worlds = two difficulty/behaviour modes
- **Real world (pre-Underworld) = EASY.** The Carnival / human-world stages play gently: monsters are
  **passive** (don't pursue) — you explore, do scene beats, fight only what you choose. (Engine: force
  the `passive`/no-aggro branch of the personality AI in real-world zones.)
- **Underworld = HUNTED.** Monsters **actively seek you** (aggro from far, relentless chase) the moment
  you're in the Underworld. The only respite: **find & eat human food** in the Underworld, which
  *masks your scent* and pauses the hunt for a while (ties directly to the source's Ep6 mechanic and
  to our Corruption/anchor system). (Engine: a `worldMode` flag — real vs under — that overrides the
  personality AI: real → all `passive`; under → all `aggroNow`-style hunt, with a `scentMaskedT` timer
  set by eating human food that temporarily reverts them to passive.)
- This makes the descent a *felt* difficulty cliff — exactly the tonal shift the source intends.

### 11.4 Co-op — share a session code (1 guest), reuse the MOBA netcode
- The MOBA already has on-demand **PeerJS host/guest** (`ensurePeer`, `NET.mode`, `netSendInput`).
  Port that pattern into the Hunt: the host shares a **session code**; **one** other player can join.
- In zones/episodes where companions are present, the **guest plays as one of: 🐾 Barkindle (the pet),
  Yui, or Ayume** (whichever fits that episode's roster). Solo play = those are AI; co-op = the guest
  takes one over. Host stays authoritative (mirror the MOBA's host-authoritative model).
- Scope: this is the **biggest** new piece — slot it in **Phase C** (companions), after the dialogue/
  episode scaffolding and the corruption spine exist.

### 11.5 Barkindle — your pet from the very start
- The player **always begins with the pet Barkindle** (`pets/90_Barkindle.glb`, Fire/Combat) — a fixed
  companion, not a random mob model. Barkindle stays with you across most quests.
- Barkindle is also one of the **co-op roles** a guest can take (§11.4).
- Engine: the starting pet in `startRun` is forced to the `barkindle` slot (autoLoad `90_Barkindle.glb`)
  instead of a random `MOB_SLOTS` pick; the pet's name = "Barkindle" for voice/UI.

### 11.7 Implementation log

- **2026-06-14 — Phase A (first slice) SHIPPED into pve.html** (node-validated, browser pass pending):
  - **Player naming**: `SAVE.heroName` (new save field); first-launch `#nameAsk` overlay ("What is your
    name, hero?") → stores name → `heroName()` used for the hero (`hero.monName`), the title card, and
    dialogue `[NAME]` tokens. Ayume/Yui stay fixed.
  - **Dialogue system**: `#dlg` visual-novel overlay (portrait + nameplate + typewriter), `CHARS` table
    (hero/ayume/yui/barkindle/fortune/yume/kage/narrator with glyph+colour+side), `playDialogue(lines,
    onDone)` / `dlgNext()` (click-advance, instant-complete on click, end-callback). Game input blocked
    while active (`dlgActive()` guard + ignore-list).
  - **First-launch carnival intro**: `playIntro()` runs the wagon→carnival opening ([NAME] + Ayume +
    Barkindle) after naming, then reveals the title. (Old "Sundering" modal retired from the flow.)
  - **Kai-only**: `dayHeroes=[Kai]`, `pickIdx=0`; title GO button → "ENTER THE CARNIVAL".
  - **Barkindle starter pet**: preloaded in init (`autoLoad('barkindle','90_Barkindle.glb')`); startRun
    forces the companion to the `barkindle` slot (was a random mob model), `p.petName='Barkindle'`.
  - **Placeholder portraits**: emoji+tinted-frame for now (per §11.2 option b); swap to real art later.
  - **NOT yet done (next):** two-world hunt/scent-mask behaviour (§11.3, Phase B), co-op session code
    (§11.4, Phase C), Carnival hub re-skin, episode gating/chapter screen, Corruption gauge.

### 11.6 Build order impact
- **Phase A now also includes:** the **name prompt**, the **dialogue-portrait system**, and **Barkindle
  as the guaranteed starter pet** — all three are concrete and unblock the story feel immediately.
- **Phase B** folds in the **two-world hunt/scent-mask** behaviour alongside the Corruption gauge.
- **Phase C** adds **co-op (session code, 1 guest as Barkindle/Yui/Ayume)** with the companion system.
