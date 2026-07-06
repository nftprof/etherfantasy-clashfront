# Framework reference — how the website computes each pet

> This is the EXACT logic the live populace site runs (`claim-prototype/index.html` `capVector()` + `affinity.js`). It is the site's interpretation of **Addendum E** (`../ADDENDUM-E-PentaPet-Species-Affinity.pdf`), made concrete per-pet.

## The aptitude formula (5 axes, 0–100)
```
for each axis k in [industry, agriculture, military, logistics, arcane]:
  base = primaryElement.v[k]                       // 0–80 per element
  if dualType: base = round(base*0.70 + secondaryElement.v[k]*0.45)
  aptitude[k] = min(100, round(base * rankMultiplier))
```
Productivity in-game (per Addendum E): **Base Skill × Experience × Species Affinity × Morale × Equipment**. The site surfaces *Species Affinity* (this vector) and the *rank multiplier*; the other factors are gameplay.

## Rarity → Rank multiplier
| Rarity | Rank | ×mult | Presence/aura | Scope |
|--------|------|------:|------|------|
| common | Companion | 1 | — | A loyal summon — answers one task at a time, and keeps kingdoms breathing. |
| uncommon | Adept | 1.15 | — | A quick study — masters advanced tasks and answers the horn faster than most. |
| rare | Elite | 1.35 | +5% output to any work party it joins | A veteran of many summons — other creatures rally around it. |
| legendary | Champion | 1.7 | +10% aura to every creature in its district | A creature of renown — leads packs in war and great works in peace. |
| mythic | Ancient | 2.2 | +15% kingdom-wide morale & a unique edict only it can grant | A one-of-two primordial being — kingdoms bend their strategy around its presence. |

## The 17 elements — capability vectors + roles
Each element carries a base vector (0–80) and role lists. "Summon it for" on the site = the primary element's Kingdom work / War duties / Brings home.

### ⛰ Earth — *The builders beneath the world*
- **Vector:** industry 65 · agriculture 25 · military 55 · logistics 20 · arcane 10
- **Kingdom work:** Mining, Quarrying, Construction, Masonry, Excavation, Terraforming
- **War duties:** Heavy Infantry, Shield Units, Defensive Engineers, Fortress Builders
- **Brings home:** Stone, Clay, Iron, Granite, Mountain Infrastructure
- *hewn from bedrock and patient as mountains — kingdoms are raised on their shoulders*

### 🪨,  Rock — *Living bastions of stone*
- **Vector:** industry 70 · agriculture 10 · military 60 · logistics 15 · arcane 5
- **Kingdom work:** Quarrying, Heavy Construction, Road Building, Demolition
- **War duties:** Bulwark Units, Siege Absorption, Wall Wardens
- **Brings home:** Granite, Ore, Fortifications
- *slow to anger, impossible to move — the wall a kingdom hides behind*

### 🔥 Fire — *The forge-hearts of industry*
- **Vector:** industry 70 · agriculture 5 · military 60 · logistics 15 · arcane 20
- **Kingdom work:** Blacksmithing, Smelting, Glass Making, Metal Refining, Weapon Crafting
- **War duties:** Siege Engineers, Assault Units, Artillery Specialists
- **Brings home:** Weapons, Armor, Industrial Production
- *every blade and ingot a kingdom owns passed first through their flames*

### 🌊 Water — *Masters of tide and trade*
- **Vector:** industry 25 · agriculture 45 · military 40 · logistics 65 · arcane 15
- **Kingdom work:** Fishing, Irrigation, Harbor Operations, Navigation, Water Mills
- **War duties:** Naval Crew, Marines, River Logistics
- **Brings home:** Shipping, Trade, Fisheries
- *where rivers meet the sea, their harbors turn current into coin*

### 🌿 Leaf — *Keepers of field and forest*
- **Vector:** industry 15 · agriculture 70 · military 20 · logistics 25 · arcane 25
- **Kingdom work:** Farming, Forestry, Herbalism, Ranching, Orchard Management
- **War duties:** Medical Support, Supply Corps
- **Brings home:** Food, Timber, Medicine, Population Growth
- *granaries overflow and forests regrow wherever they settle*

### ⚡ Lightning — *Engineers of the arcane current*
- **Vector:** industry 60 · agriculture 10 · military 45 · logistics 30 · arcane 55
- **Kingdom work:** Workshops, Machinery, Automation, Magical Infrastructure, Research
- **War duties:** Battlefield Support, Arcane Engineering
- **Brings home:** Technology, Advanced Crafting, Automation
- *their workshops hum through the night, wiring magic into machinery*

### 🪽 Flyer — *Wings of the trade winds*
- **Vector:** industry 10 · agriculture 15 · military 45 · logistics 70 · arcane 15
- **Kingdom work:** Couriers, Scouts, Caravan Leaders, Exploration, Messengers
- **War duties:** Reconnaissance, Fast Cavalry, Ambush Specialists
- **Brings home:** Transport, Trade Routes, Logistics
- *nothing crosses the map faster — news, cargo, or the first strike*

### ❄ Ice — *Wardens of the frozen frontier*
- **Vector:** industry 30 · agriculture 30 · military 55 · logistics 40 · arcane 35
- **Kingdom work:** Cold Storage, Preservation, Glacier Harvesting, Arctic Pathfinding
- **War duties:** Winter Warfare, Slowing Fields, Frost Garrisons
- **Brings home:** Preserved Goods, Rare Ice Cores, Northern Trade
- *they keep the harvest through winter and hold passes no army dares in snow*

### 🐉 Dragon — *Sovereign bloodlines of war*
- **Vector:** industry 30 · agriculture 10 · military 75 · logistics 30 · arcane 50
- **Kingdom work:** Treasury Guarding, Grand Construction Oversight, Relic Keeping
- **War duties:** Elite Shock Units, Air Superiority, Terror Tactics
- **Brings home:** Treasure Hoards, Prestige, Tribute
- *a single one on the field changes how both armies plan the day*

### 🔮 Mystic — *Scholars of the unseen*
- **Vector:** industry 15 · agriculture 15 · military 35 · logistics 20 · arcane 75
- **Kingdom work:** Arcane Research, Enchanting, Divination, Academy Teaching
- **War duties:** Battle Magi, Ward Casters, Ritual Support
- **Brings home:** Scrolls, Enchantments, Knowledge
- *they read tomorrow in the ether and sell certainty to kings*

### 👁 Phantom — *Shadows in the kingdom’s service*
- **Vector:** industry 10 · agriculture 5 · military 60 · logistics 35 · arcane 60
- **Kingdom work:** Night Watch, Archives of Secrets, Dream Tending
- **War duties:** Espionage, Sabotage, Night Operations, Fear Warfare
- **Brings home:** Intelligence, Contraband Recovery
- *half-seen and never caught — wars are won before dawn by their hand*

### 🧠 Telepath — *Minds that bind the realm*
- **Vector:** industry 20 · agriculture 20 · military 30 · logistics 45 · arcane 70
- **Kingdom work:** Coordination, Diplomacy, Census & Planning, Education
- **War duties:** Command Relay, Morale Operations, Interrogation
- **Brings home:** Administration, Treaties, Efficiency Gains
- *a kingdom with one of these never suffers a message lost or a mind idle*

### ⚙ Iron — *The metal spine of the economy*
- **Vector:** industry 75 · agriculture 5 · military 65 · logistics 20 · arcane 10
- **Kingdom work:** Metallurgy, Heavy Manufacturing, Armor Smithing, Rail Building
- **War duties:** Armored Units, Warmachine Crews, Line Breakers
- **Brings home:** Steel, Machinery, Armaments
- *they do not tire, rust, or complain — production quotas fear them*

### 🐛 Insect — *The swarm that never sleeps*
- **Vector:** industry 50 · agriculture 55 · military 35 · logistics 30 · arcane 10
- **Kingdom work:** Swarm Labor, Pollination, Silk Production, Tunnel Networks
- **War duties:** Swarm Tactics, Attrition Units, Field Repair
- **Brings home:** Silk, Honey, Rapid Construction
- *one is nothing; a thousand raised a city in a season*

### ☠ Toxin — *Alchemists of rot and remedy*
- **Vector:** industry 25 · agriculture 40 · military 45 · logistics 15 · arcane 55
- **Kingdom work:** Alchemy, Medicine Brewing, Pest Control, Waste Reclamation
- **War duties:** Poison Warfare, Area Denial, Antidote Corps
- **Brings home:** Potions, Antidotes, Reagents
- *the same claw that taints a well can cure a plague — priced accordingly*

### ⚔ Combat — *Born soldiers of the realm*
- **Vector:** industry 20 · agriculture 10 · military 75 · logistics 25 · arcane 10
- **Kingdom work:** Guard Duty, Militia Training, Arena Instruction, Escort Work
- **War duties:** Front Line, Duelists, Drill Sergeants, Vanguard
- **Brings home:** Security, Mercenary Contracts, Training Fees
- *peace makes them restless; every garrison wants ten more of them*

### ⚪ Neutral — *The versatile heart of the workforce*
- **Vector:** industry 40 · agriculture 40 · military 40 · logistics 40 · arcane 30
- **Kingdom work:** General Labor, Apprenticeships, Shopkeeping, Any Trade
- **War duties:** Reserves, Auxiliary Corps, Logistics Support
- **Brings home:** Flexible Labor, Steady Output
- *masters of nothing, useful at everything — the backbone of every census*

