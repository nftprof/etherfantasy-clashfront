# Clash Front Agent Development Bible v0.2

## Vision

Clash Front is the persistent simulation layer connecting EF Mobile, EF
Hunt, EF MOBA and the overworld.

### Ecosystem

-   EF Mobile --- Begin Your Journey
-   EF Hunt --- Live the Story. Become Stronger.
-   EF MOBA --- Prove Your Skill.
-   Clash Front --- Use Your Strength to Change the World.

Shared progression: Heroes, PentaPets, NFTs, Equipment, CT, World State.

## Design Pillars

-   Persistent world.
-   AI-first simulation.
-   Logistics over micromanagement.
-   Player-built civilization.
-   Shared progression.
-   Human attention is limited.

## World

Hex parcels (\~14 acres) are the smallest political unit. Each stores
owner, occupier, geology, prosperity, buildings, roads, terrain,
population and resources.

Wild terrain launches EF Hunt.

## Travel

Real-time movement. Consumes time, food and morale.

Friendly: free. Allied: treaty passage. Wild: passable with penalties
and Hunt encounters. Enemy: blocked until battle. Sea uses fixed harbor
routes.

## Logistics

Finite rations limit campaign distance. Supply from settlements, depots,
harbors and caravans. Broken supply lowers morale (20%-120%) then
starvation and desertion.

## Battles

Existing EF MOBA is the battle engine. Scheduler decides Live, Scheduled
or Accelerated. Low priority NPC battles accelerate. Players may join
ongoing battles. Timeouts resolve by war score.

## PentaPets

PentaPets replace abstract population. They serve as workers, soldiers,
companions and battle units. AI governors allocate workforce by
priority. Species have occupational affinities.

## Terraforming

Landowners permanently reshape terrain. Excavation creates reusable
materials. Matter is conserved.

## Ownership

Landowner: - terraform - zone - city planning

Occupying Kingdom: - walls - forts - depots - military infrastructure

Captured territories may be occupied, preserved or plundered.

## Geology

Resources never fully deplete. Extraction becomes progressively harder.
Supports surveys, prospecting and deep mining.

## Blueprint Economy

Players design with AI. First successful build unlocks Blueprint NFT.
Blueprint stores procedural recipe, materials, royalties and layout.
Blueprints still require labor and materials to construct.

## AI Polygon Construction

No arbitrary mesh imports. Buildings are generated from validated
modular polygon components. Server stores recipes, not meshes.

## Living Economy

Cities emerge organically. Buildings consume labor and resources. Shops,
blacksmiths, ports and markets are player driven.

## Automated Logistics

Players create transport contracts. AI chooses route, carrier and
escorts. Physical caravans can be attacked.

## Circular Economy

Geology -\> Mining -\> Transport -\> Crafting -\> Construction -\>
Cities -\> War -\> Plunder -\> Recovered Materials -\> Marketplace -\>
Reconstruction.

## AI Services

World Simulation Governor Military Diplomacy Economy Construction
Blueprint Logistics Battle Scheduler EF Hunt Integration EF MOBA
Integration

## Goal

Players progress naturally: EF Mobile -\> EF Hunt -\> EF MOBA -\> Clash
Front. Everything contributes to one persistent civilization.
