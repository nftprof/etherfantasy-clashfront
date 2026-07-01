# EF Moba — Monster Lineage & Type Research

Source: Public_Main_Mon_Sheet_v11.xlsx -> tab **Mons Ancestry**, cross-referenced against the 128 .glb files in pets/. Models are named `<classId>_<Name>.glb`; the sheet lists each Form-1 mon plus its Form-2/Form-3 class ids, so evolutions map directly to files.

## Headline findings

- **110** Form-1 mons have a Form-1 glb present.
- **23** have **Form-1 + Form-2** both present AND fully rigged (idle/walk/run/attack) -> these support the **upgrade** mechanic.
- **59** are **Form-1 only** -> base units.
- **0** have a usable **Form-3** glb. The Form-3 class ids (~52-90, 158+) are NOT in the pets folder.

### Recommendation for Form-3 / heroes
No Form-3 models exist, so heroes use a chain Form-2 model scaled to 2.5x as a stand-in evolved hero until Form-3 glbs arrive. Scaling rule stays F1=1x, F2=1.5x, F3=2.5x.

## Upgrade chains (Form 1 -> Form 2): 23 usable

| Form 1 | Form 2 | Type(s) | F1 file | F2 file |
|---|---|---|---|---|
| Dilloom | Dillow | Leaf/Toxin | 1_Diloom.glb | 38_Dillow.glb |
| Dynamouse | Pyrode | Fire | 2_Dynamouse.glb | 39_Pyrode.glb |
| Nageel | Moranagi | Water | 3_Nageel.glb | 40_Moranagi.glb |
| Eekape | Moldec | Phantom/Toxin | 4_Eekape.glb | 41_Moldec.glb |
| Palytid | Oculid | Toxin | 5_Palytid.glb | 42_Oculid.glb |
| Mianari | Surinari | Lightning | 6_Mianari.glb | 43_Surinari.glb |
| Berrball | Silvyx | Mystic | 7_Berrball.glb | 44_Silvyx.glb |
| Cesstoid | Coronoid | Neutral/Mystic | 8_Cesstoid.glb | 45_Coronoid.glb |
| Mizumi | Watadzumi | Neutral | 9_Mizumi.glb | 46_Watadzumi.glb |
| Chulember | Fuenago | Fire | 10_Chulember.glb | 47_Fuenago.glb |
| Geckno | Geckelic | Telepath | 11_Geckno.glb | 48_Geckelic.glb |
| Blockid | Blockall | Combat | 12_Blockid.glb | 49_Blockall.glb |
| Geenee | Geerex | Neutral | 18_Geenee.glb | 50_Geerex.glb |
| Baulder | Dredrock | Dragon | 20_Baulder.glb | 51_Dredrock.glb |
| Mintol | Florost | Leaf/Ice | 25_Mintol.glb | 52_Florost.glb |
| Omnom | Yumee | Water/Mystic | 26_Omnom.glb | 53_Yumee.glb |
| Lectrobe | Wrektric | Lightning/Toxin | 28_Lectrobe.glb | 55_Wrektric.glb |
| Mirrie | Reflectre | Phantom/Iron | 29_Mirrie.glb | 56_Reflecter.glb |
| Lollipunch | Mawverize | Combat | 31_Lollipunch.glb | 58_Mawverize.glb |
| Odwig | Occlusk | Leaf | 32_Odwing.glb | 59_Occlusk.glb |
| Tygloo | Mechloo | Ice/Neutral | 33_Tygloo.glb | 60_Mechloo.glb |
| Pudde | Aquary | Water/Telepath | 34_Pudde.glb | 61_Aquary.glb |
| Fuirrel | Squake | Neutral | 37_Fuirrel.glb | 62_Squake.glb |

## Base-only mons (Form 1, animated): 59

Thermolophus (Rock/Earth), Keradon (Earth), Vermillios (Water), Vivorin (Insect/Flyer), Windora (Water/Flyer), Quillster (Neutral), Vibe (Phantom), Swifty (Telepath), Pangrass (Leaf/Neutral), Mushmite (Water), Polynimo (Fire), Morinori (Iron), Gremin (Flyer), Spoxin (Toxin), Intelix (Mystic), Inkami (Flyer/Telepath), Redhandit (Combat/Phantom), Endorr (Leaf/Rock), Sonectid (Insect/Iron), Cryptise (Phantom/Earth), Barkindle (Fire/Combat), Ruffski (Ice/Neutral), Matara (Earth), MalakelE (Toxin/Combat), Tobeno (Neutral/Flyer), Flaraton (Fire/Earth), Ekopi (Leaf/Earth), Krubble (Water/Iron), Tipsillar (Insect/Lightning), Grubgas (Toxin/Iron), Kelpony (Ice/Rock), Lemeeni (Leaf/Combat), Iquander (Dragon/Fire), Mindallion (Iron/Mystic), Krakowee (Insect/Rock), Felistar (Phantom/Lightning), Dusprite (Mystic/Toxin), Clothom (Phantom/Flyer), Pistaccoul (Insect/Earth), Kikapole (Telepath/Combat), Vexigon (Dragon/Neutral), Greipawn (Leaf), Vernirox (Earth/Rock), Quadrossal (Telepath/Mystic), Zedakazm (Dragon/Phantom), Armadigoal (Iron/Rock), Kyberra (Mystic/Leaf), Pigperus (Earth/Ice), Piggicius (Water/Insect), Foxeez (Ice/Phantom), Roichirp (Flyer), Watuber (Water/Combat), Vaudequin (Fire/Mystic), Helichrome (Iron/Dragon), Onchor (Water/Iron), Sully (Iron/Flyer), Cannubis (Leaf/Phantom), Fauneek (Earth/Combat), Inchapp (insect/Lightning)

## Elemental types (17)
Insect, Dragon, Mystic, Fire, Phantom, Earth, Neutral, Telepath, Iron, Lightning, Combat, Flyer, Leaf, Ice, Toxin, Rock, Water.

Designed Pokemon-style chart (attacker deals 1.5x to):

- **Fire** -> Leaf, Insect, Ice, Iron
- **Water** -> Fire, Earth, Rock
- **Leaf** -> Water, Earth, Rock
- **Lightning** -> Water, Flyer
- **Earth** -> Fire, Lightning, Toxin, Rock, Iron
- **Ice** -> Leaf, Earth, Flyer, Dragon
- **Combat** -> Neutral, Ice, Rock, Iron, Toxin
- **Toxin** -> Leaf, Water
- **Telepath** -> Combat, Toxin
- **Insect** -> Leaf, Telepath, Mystic
- **Rock** -> Fire, Ice, Flyer, Insect
- **Phantom** -> Phantom, Telepath, Mystic
- **Dragon** -> Dragon
- **Iron** -> Ice, Rock, Mystic
- **Flyer** -> Leaf, Combat, Insect
- **Mystic** -> Dragon, Combat, Phantom
- **Neutral** -> (no bonus)

## Proposed game integration

1. Data-driven roster from mon_lineage.json; each unit/hero is a mon with type(s) and optional Form-2 upgrade.
2. Scaling: F1 base, F2 1.5x, F3 (hero stand-in) 2.5x; stats scale with size.
3. Upgrade button: units/heroes with a Form-2 can Evolve (spend resources) -> swap glb at 1.5x with boosted stats.
4. Heroes pick from the 23 chains and evolve toward the 2.5x form.
5. Type combat: damage x1.5/x0.66 by attacker-vs-defender type, with an effectiveness cue.