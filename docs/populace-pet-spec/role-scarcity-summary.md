# Role scarcity & rank ceiling - the tuning numbers

> Answers the 3 asks in `../reports/PET-APTITUDE-ECONOMY-MAP.md` section 5: role supply (-> prices), rank ceiling (-> power cap), biome pools. **Capacity** = the ecological cap per species (max that can ever exist); it is the real scarcity lever, not species count.

Total world capacity across the 228 aptitude-bearing species: **14,175 pets**.

## 1. Role supply - dominant-role distribution (sets prices)
Each species is counted by its **strongest** aptitude. "Capacity" = how many such pets the world can hold.

| Dominant role | Species | Capacity | % of world cap |
|---|--:|--:|--:|
| Farmer | 36 | 1,945 | 13.7% |
| Soldier | 79 | 4,005 | 28.3% |
| Crafter | 55 | 4,028 | 28.4% |
| Hauler | 28 | 2,373 | 16.7% |
| Adept | 30 | 1,824 | 12.9% |

> Read: whichever role has the **least** capacity is scarcest -> commands the highest wage/price. (A pet can still do any role, just worse - this is the *specialist* supply.)

## 2. Rank ceiling - capacity by rarity (power cap + NFT value)

| Rarity | Rank xmult | Species | Capacity | % of world |
|---|---|--:|--:|--:|
| common | Companion x1 | 31 | 4,650 | 32.8% |
| uncommon | Adept x1.15 | 81 | 6,075 | 42.9% |
| rare | Elite x1.35 | 80 | 3,040 | 21.4% |
| legendary | Champion x1.7 | 26 | 390 | 2.8% |
| mythic | Ancient x2.2 | 10 | 20 | 0.1% |

> The x2.20 mythic tier is capped at **20 pets total** across 10 species - that is the hard power ceiling. Legendary+mythic combined = 2.9% of world capacity.

## 3. Biome pools - capacity by suggested biome (from primary element)
Starting point for "which mons the command center hires per biome"; refine with the CF biome wheel.

| Biome (hint) | Species | Capacity |
|---|--:|--:|
| Coast/River | 29 | 1,701 |
| Forest | 29 | 1,687 |
| Volcanic | 20 | 1,612 |
| Arcane Ruins | 18 | 1,034 |
| Grassland | 16 | 956 |
| Jungle | 17 | 911 |
| Skyreach | 9 | 901 |
| Tundra | 13 | 859 |
| Storm Plains | 9 | 766 |
| Ironworks | 12 | 745 |
| Haunted Wastes | 13 | 679 |
| Highlands | 10 | 596 |
| Swamp | 9 | 527 |
| Battleplains | 9 | 527 |
| Volcanic Peaks | 13 | 524 |
| Mountains | 2 | 150 |

_Capacity is the launch/design ecological cap (`species.js`); live on-chain capacity can grow via the Capacity Oracle within bounds. Mythic caps are tiny by design (~2/species)._
