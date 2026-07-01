# EtherFantasy MOBA — Player Guide & Feature Reference

> Player-facing reference for the start-menu help page / loading tips. Maintained
> by the scheduled **`efmoba-guide-review`** job (reviews the source and refreshes
> this file). Companion shotlist for screenshots is at the bottom.
> Last full review: 2026-06-28.

---

## 1. Controls & hotkeys (MOBA — `index.html`)

### Mouse
| Input | Action |
|---|---|
| **Left-click** | Select a unit / building |
| **Left-drag** | Box-select your units |
| **Shift + left-click** a unit | Select **all units of that same type** on screen |
| **Right-click** | Move there · attack an enemy under the cursor (always instant) |
| **Alt + click** (drag to a slice, release) | **Signal / ping wheel** (Help, Attack, Defend, Gather, Omw, Retreat) |
| **Mouse wheel** | Zoom in / out |
| **Click the minimap** | Jump the camera there |

### Keyboard
| Key | Action |
|---|---|
| **Q / W / E / R** | Hero skills (R = ultimate). Quick-cast or aim-then-click (see ⚡) |
| **A** | Attack-move (then click a spot) |
| **D** | Flash (blink a short distance, ~2 min cooldown) |
| **P** | Potion (restore ~25% HP, ~2 min cooldown) |
| **G** | Recall (stand still ~4s to teleport home; taking damage cancels) |
| **F** | **Pet Heal** — heal your pet (when no units are selected) |
| **B** | Open the Shop |
| **T** or **1** | Jump to your Town Hall + open the train menu |
| **N** | Toggle ⚡ Quick-cast (press-to-cast vs aim-then-click) |
| **J** | Cycle ❤ health-bar display: **All → Hurt-only → Off** |
| **Y** | Emote |
| **Tab** (hold) | **Scoreboard** — per-hero Level / Kills / Deaths / CS / items, both teams |
| **Space** | Re-center the camera on your hero |
| **Esc** | Cancel aim / deselect |
| **Arrow keys / screen edges** | Pan the camera *(only when 🎥 Follow is OFF)* |

### With units selected
| Key | Action |
|---|---|
| **H** | Hold position |
| **S** | Stop |
| **F** | **Soldiers: Forward** (march down the lane) · Workers: Follow |
| **C** | Workers: Chop wood (nearest tree) |
| **V** | Workers: Mine gold (nearest mineral) |

### Control groups (StarCraft-style)
| Input | Action |
|---|---|
| **Ctrl/Alt + 2–0** | Assign the selected units to that group number |
| **2–0** | Re-select that group |

---

## 2. Camera
- **🎥 Follow (default ON):** the camera stays locked on your hero. Edge/arrow panning is
  disabled so brushing the window edge can't drift the map. Toggle it off (top-bar button)
  for free StarCraft-style scrolling with the screen edges / arrow keys.
- **Always bottom-left:** your base is rendered bottom-left, the enemy top-right, every game.
- **Zoom:** mouse wheel. Health bars stay a constant size as you zoom.

---

## 3. Top-bar buttons
| Button | What it does |
|---|---|
| **⏱ / Bases / Enemy Core** | Match timer · your base count · enemy core HP |
| **⚑ FF** | Surrender (forfeit the match) |
| **⚡ Quick-cast** | ON = press a skill to cast at the cursor (new-player friendly). OFF = aim, then click. (Hotkey **N**; hold Shift for the opposite on one cast) |
| **🎥 Follow** | Lock the camera to your hero (see Camera) |
| **❤ Bars** | Cycle floating health-bar display (All / Hurt / Off). Hotkey **J** |
| **🏰 Town Hall** | Jump to your town hall + open the train menu. Hotkey **T/1** |
| **📣 Ping** | Open the signal wheel (also **Alt+click** on desktop) |
| **🛒 Shop (B)** | Open the item shop |

---

## 4. Economy & RTS (Warcraft-style)
- **Town Hall / Bases:** train units, upgrade in tiers (more HP + a stronger built-in cannon),
  and build at the glowing **build pads** around your side. Press **T/1** to jump there fast.
- **Workers (pets):** gather **gold** (mine, **V**) and **wood** (chop, **C**), **repair**
  damaged towers/bases (costs wood), and can be summoned from the base menu (**✨ Summon Pets**).
- **Soldiers (Footman / Archer):** trained at the base; they **auto-evolve** after fighting a
  while; use **F (Forward)** to push them straight down a lane.
- **Shop:** buy gear with **gold** while near a friendly **town hall / base** *or* on your
  **spawn (the starting heal zone)**. Items stick through death; legendaries can drop.

---

## 5. Combat
- **Heroes:** Irene (archer), Kai (sword), Leah (mage). Skills **Q/W/E/R**, **Flash (D)**,
  **Potion (P)**, **Recall (G)**. Out-of-combat HP regen; fountain heals fast.
- **Pets:** tiered — Tier 1 basic + 1 skill, Tier 2 (evolve, retaliates while gathering),
  Tier 3 (unlocks super + auto-aggro). **Permadeath** — a dead pet is gone for good.
- **Air vs land:** flyers can only be hit by **ranged units (archers/mages), other flyers, and
  towers** — melee units can't reach them. Air units can hit everything.
- **Boss & wild camps:** a boss holds a lair (auto-heals when left alone); wild monsters roam.
- **Masters:** recruitable helper NPCs that appear randomly on the map — walk to one and it
  **joins your side** and fights alongside your hero.

---

## 6. Map & Minimap
- **3 lanes**, two fountains (safe spawn/heal), towers gating each core.
- **Minimap (bottom-right):**
  - **Viewport box** — a white rectangle showing exactly what's on your screen.
  - **Radar alerts** — your town hall / base / tower under attack or destroyed fires a bright
    **red flashing** pulse (enemy structure down pings green).
  - **Boss timers** — boss lairs show a respawn countdown.
  - **Pings** — your signals show up here.
  - **Click** the minimap to jump the camera; it's oriented to match your view.

---

## 7. Signals (ping wheel)
**Alt + click** the map (or the **📣** button / the mobile ⋯ drawer). Drag toward a slice and
release: **❗ Help · ⚔ Attack · 🛡 Defend · 🟢 Gather · 🏃 Omw · ↩ Retreat**. Each drops a
world marker + a minimap ping + a callout (and reaches allies in online matches).

---

## 8. Mobile
The on-screen touch cluster currently ships in **EF Hunt** (`pve.html`): an Arena-of-Valor
layout with a **joystick** to move, a diamond of **Q/W/E/R + ATK** skill buttons (each shows a
radial cooldown sweep), small utilities (**B** Build / **T** Town / **S** Stop), and a **⋯ drawer**
for 📖 Guide / 🗺 Map / 📜 Journal. The MOBA (`index.html`) is currently played with **keyboard +
mouse** — its on-screen joystick/skill cluster is not wired up in this build. The help panel
collapses behind a **❔** button.

---

## 9. Online (server-hosted)
Sign in at **moba.etherfantasy.com** with your Pentagon Games account → pick a region → land in
a **lobby** (Quick Match / create / join by code) → ready up → the match runs on the server
(no one self-hosts). See `server/` docs for the build team.

---

## 10. EF Hunt (`pve.html`) — solo ARPG
A separate Diablo×Palworld hunt: corruption/scent loop, dungeons, Blood Moon events, story
episodes, AI companions, and per-realm Wardens. Same hero rigs (Irene/Kai/Leah), AoV-style
mobile controls. (Its own guide lives in-game under 📖.)

---

## Screenshot shotlist (for the start-menu page / loading tips)
> A headless scheduled job can't capture live gameplay — capture these in a browser
> (`http://localhost:8000/index.html`) and drop them next to this guide, or ask for an
> interactive capture pass.

1. `guide_hud.png` — full match HUD (top bar, minimap with viewport box, skill tray).
2. `guide_townhall.png` — Town Hall train menu open.
3. `guide_shop.png` — Shop open near a base.
4. `guide_pingwheel.png` — Alt+click signal wheel open.
5. `guide_minimap_alert.png` — minimap mid red radar alert (base under attack).
6. `guide_buildpads.png` — glowing build pads on your side.
7. `guide_mobile.png` — EF Hunt (`pve.html`) touch layout: joystick + Q/W/E/R+ATK diamond + ⋯ drawer.
8. `guide_lobby.png` — the online lobby / region picker.
9. `guide_scoreboard.png` — Tab scoreboard overlay (per-hero Lv/K/D/CS/items, both teams).

---

## Change log
- 2026-06-28 — Added **Tab → Scoreboard** and hero **F → Pet Heal** to the hotkey table; clarified Flash/Potion/Recall cooldowns; corrected the **Mobile** section (touch cluster ships in EF Hunt; the MOBA is keyboard+mouse in this build); added `guide_scoreboard.png` to the shotlist.
