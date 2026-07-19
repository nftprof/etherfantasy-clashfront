export const title = 'Economy — CT and Gold';
export const description = 'How the economy works: CT outside the battle, Gold inside, plunder, enrichment, landlord tax.';
export const body = `
<div class="page-head">
  <div class="wrap-narrow">
    <div class="eyebrow">Economy</div>
    <h1>Two currencies, one loop</h1>
    <p class="lede">Clash Front runs on two currencies with a fixed conversion between them. CT is the money — deposited from your wallet, spent on land actions, withdrawn back. Gold is the in-battle resource — mined during a fight, spent on towers and hires, plundered on victory. Everything round-trips through the same rate.</p>
  </div>
</div>

<section class="slab"><div class="wrap">
  <h2>CT — the money layer</h2>
  <p>CT is the Ether Fantasy token, live on Pentagon Chain. It's the currency of the game world. In CF, CT pays for:</p>
  <ul>
    <li>Raising armies (per-soldier + per-officer costs, split across food/gold/wood)</li>
    <li>Renting Masters (from the Masters API rental market)</li>
    <li>Enriching your land (see below — this is the landlord's main use)</li>
    <li>Developing tracks — AGRICULTURE / ECONOMY / DEFENSE / MILITARY levels</li>
    <li>Building defensive modules (WALL, TOWER, GATE, TRAP, GRANARY, PET_DEN)</li>
    <li>Committing to a MARCH & COMMAND live battle (the queue fee)</li>
    <li>Summoning non-native pet species from your NFT blueprints</li>
  </ul>
  <p class="dim">At v2 pricing (÷100 rescale, 2026-07-10): a line soldier ≈ 0.02 CT, a level-1 development ≈ 1–1.5 CT. Start balances ≈ 5 / 50 / 500 CT depending on account tier. At ≈ $0.10/CT, most actions cost pennies.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Gold + materials — the overworld resource layer</h2>
  <p>Extraction happens on the <strong>CF overworld map</strong>, not on the battlefield. Assign worker pets to your parcels — they mine, farm, and craft over time based on the land's biome and enrichment level. What they produce sits in the parcel's stockpile until you ship it, spend it, or lose it.</p>
  <ul>
    <li><strong>MINE workers</strong> → Gold + Wood + Iron + Stone + rare metals to the territory stockpile</li>
    <li><strong>FARM workers</strong> → Food to the territory's food stock</li>
    <li><strong>CRAFT workers</strong> at a Workshop → equipped arms + fortification upgrades from stockpile materials</li>
    <li><strong>GUARD workers</strong> → defensive contribution when the parcel comes under attack</li>
  </ul>
  <p>Species matters — Fire pets mine volcanic ground better; Leaf pets farm forest better; Iron pets mine anywhere at a bonus. NFT-blueprint owners can summon any species onto any parcel, paying an ongoing summon-premium in CT for the privilege.</p>
  <div class="rule"><strong>In-battle economy stays minimal.</strong> Attackers carry <em>provisions</em> — food, gold, wood — into the fight from their home stockpile. Battle-food burns upfront. Carried gold + wood erect an attacker command center (temporary scoring bonus, spent win or lose). No mid-battle mining. No mid-battle build. The battle map is a fight — the economy lives on the CF overworld map where the workers work.</div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Landlord tax + enrichment — the landowner's game</h2>
  <p>Land isn't passive real estate. It's a machine that clips a share of every economic flow that passes through it, and it grows more valuable the more its owner invests.</p>
  <ul>
    <li><strong>30% landlord tax</strong> on CT flows through your land. Somebody occupies it, spends CT while occupying — you take your cut, even if you're not there.</li>
    <li><strong>Enrichment</strong> — the landowner spends CT into the land's enrichment pool. The pool pays out yield to whoever CURRENTLY governs the land (so conquest inherits it — attackers who occupy pillage a share, then start receiving the trickle themselves).</li>
    <li><strong>Prosperity climbs</strong> with enrichment. Populace grows. Draft cap + speed climb. Cheaper per-soldier costs.</li>
    <li><strong>Species migration</strong> — enriched land rolls "a general arrives" migration events, expanding the pet species available to draft on that biome.</li>
    <li><strong>DNA fragments</strong> drop from enriched-land yields — enough fragments craft new pet NFTs of that species.</li>
  </ul>
  <p>Enrichment is the CT-sink that makes landowners want to make their land <em>worth</em> occupying, and gives occupiers a reason to keep enriched land under their flag instead of sacking and moving on.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>The command-queue fee</h2>
  <p>Live 30 Hz battles need real server capacity. Elective live commanding costs an escalating CT fee — 1 · 3 · 5 · 10 · 20 CT for the 1st through 5th battle you commit to at once. Max 5 concurrent per player. The fee burns (removed from circulation), which keeps the sink real. Cancellable before the battle starts → fee refunded.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Chain split</h2>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Chain</th><th>Assets</th></tr></thead>
    <tbody>
      <tr><td>Ethereum L2</td><td>Estates (L2 land NFTs)</td></tr>
      <tr><td>Polygon L3</td><td>L3 singles + hexagon-city land</td></tr>
      <tr><td>Pentagon Chain</td><td>Character NFTs (Masters), CT token, escrow accounting, burn ledger</td></tr>
    </tbody>
  </table></div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Coming later — the full loop</h2>
  <p class="dim">Specified, not implemented. See the <a href="/roadmap.html">roadmap</a>.</p>
  <ul>
    <li><strong>Farming</strong> — food production per AGRI level, populace consumption, granary caps</li>
    <li><strong>Crafting</strong> — weapon/armor construction from mined + gathered materials</li>
    <li><strong>Tax cycles</strong> — periodic draws from populace to treasury (double-entry ledger)</li>
    <li><strong>Populace mechanics</strong> — growth from prosperity, decline from starvation, rebellion risk model</li>
    <li><strong>Enrichment reveals</strong> — the full "invest CT → gain populace + draft cap + cheaper soldiers" loop live</li>
  </ul>
</div></section>

<section class="slab" id="reference-tables"><div class="wrap">
  <h2>Reference tables — the price book</h2>
  <div class="rule">
    <strong>Initial values. Subject to balancing changes without notice.</strong> Use these as a reference guide for how the economy is scoped — real in-game prices may drift as the numbers get tuned during playtest. The ratios below hold across every mode (CF overworld, AR mode, and any other Ether Fantasy layer).
  </div>

  <h3>Base currency + NPC trade ratios (baseline reference)</h3>
  <p><strong>Fixed conversion:</strong> <code>1 CT = 100 Gold</code> everywhere. No arbitrage, no exchange games. The ratios below are the <strong>reference baseline</strong>. Actual prices at each parcel drift dynamically based on local supply and demand — see the "Dynamic marketplace" section below for how AMM pricing works.</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Item</th><th>NPC sells to you</th><th>NPC buys from you</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Food (apple)</td><td>2 g</td><td>1 g</td><td>Baseline consumable</td></tr>
      <tr><td>Wood</td><td>2 g</td><td>1 g</td><td>Baseline material</td></tr>
      <tr><td>Stone</td><td>3 g</td><td>1 g</td><td>Fortification material</td></tr>
      <tr><td>Cloth</td><td>5 g</td><td>2 g</td><td>Semi-common (v0.2 material)</td></tr>
      <tr><td>Iron</td><td>5 g</td><td>3 g</td><td>Weapon / armor crafting</td></tr>
      <tr><td>Fur</td><td>10 g</td><td>5 g</td><td>Semi-rare, renewable from pets</td></tr>
      <tr><td>Rare metal</td><td>50 g</td><td>25 g</td><td>Legendary + named-artifact crafting</td></tr>
    </tbody>
  </table></div>

  <h3>Hiring costs — CF main-map, outside 3D combat</h3>
  <p>Line units draft cheap from populace. Elites cost more AND require <strong>fur</strong> for their campaign gear (cloaks, insulated harnesses — needed for overworld deployment). Archers need wood in both games (bow shafts). Siege units don't need fur — the crew rides inside the machine.</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Unit</th><th>Gold</th><th>Wood</th><th>Fur</th><th>Iron</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Line footman</td><td>2 g</td><td>—</td><td>—</td><td>—</td><td>Populace-drafted, cheapest</td></tr>
      <tr><td>Line archer</td><td>3 g</td><td>1</td><td>—</td><td>—</td><td>Bow needs wood (matches 3D game)</td></tr>
      <tr><td>Line spear</td><td>3 g</td><td>1</td><td>—</td><td>—</td><td>Spear shaft</td></tr>
      <tr><td>Line cavalry</td><td>5 g</td><td>—</td><td>—</td><td>—</td><td>Horses from populace</td></tr>
      <tr><td>Line siege</td><td>15 g</td><td>5</td><td>—</td><td>2</td><td>Complex build</td></tr>
      <tr><td><strong>Elite footman</strong></td><td>10 g</td><td>—</td><td><strong>1</strong></td><td>—</td><td>Cloak + fur trim for CF deployment</td></tr>
      <tr><td><strong>Elite archer</strong></td><td>15 g</td><td>3</td><td><strong>1</strong></td><td>—</td><td>Composite bow + insulated cloak</td></tr>
      <tr><td><strong>Elite spear</strong></td><td>15 g</td><td>3</td><td><strong>1</strong></td><td>—</td><td>Better tempered</td></tr>
      <tr><td><strong>Elite cavalry</strong></td><td>30 g</td><td>—</td><td><strong>2</strong></td><td>1</td><td>Better armor</td></tr>
      <tr><td><strong>Elite siege</strong></td><td>40 g</td><td>8</td><td>—</td><td>5</td><td>Reinforced — crew rides inside</td></tr>
    </tbody>
  </table></div>

  <h3>Pet NFT direct summon — outside battle, on your parcel</h3>
  <p>If you own the NFT blueprint for a species, you can summon it directly onto any parcel you control — bypassing the biome-native draft. Cost includes a base gold + wood + fur (campaign gear); non-native summons pay a premium; rare mythic blueprints need a heavier ceremony (rare metal, iron for the harness).</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Summon</th><th>Gold</th><th>Wood</th><th>Fur</th><th>Iron</th><th>Rare metal</th></tr></thead>
    <tbody>
      <tr><td>Native species on native biome</td><td>20 g</td><td>2</td><td>2</td><td>—</td><td>—</td></tr>
      <tr><td>Non-native summon (biome mismatch)</td><td>30 g</td><td>2</td><td>3</td><td>—</td><td>—</td></tr>
      <tr><td>Rare species (mythic blueprint)</td><td>100 g</td><td>10</td><td>10</td><td>2</td><td>1</td></tr>
    </tbody>
  </table></div>

  <h3>Fur yield by species type</h3>
  <p>Every worker pet passively yields fur per game-day into the parcel's stockpile. Fur is renewable — pets are never lost to being sheared (the Palworld model, canon).</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Species type</th><th>Fur / day per worker pet</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Warm-blooded</td><td>0.5 fur/day</td><td>Fire, Ice, Dragon, Flyer, mammalian, ursine, felid — full pelts</td></tr>
      <tr><td>Leaf</td><td>0.2 fur/day</td><td>Mossy, plant-hybrid — sheds slower</td></tr>
      <tr><td>Underworld / Phantom</td><td>0.1 fur/day</td><td>Ghostly wisps — minimal but present</td></tr>
      <tr><td>Cold-blooded / synthetic</td><td>0 fur/day</td><td>Iron, Rock, Insect, Toxin, Ships — no fur to shed</td></tr>
    </tbody>
  </table></div>
  <p class="dim">A player with 30 warm-blooded worker pets = 15 fur/day = 450 fur/month, enough for ~30 elite footman hires or ~150 pet summons per month. Cold-blooded rosters need to trade at NPC vendors (10 g/fur, 50% markup) to hire elites.</p>

  <h3>Worker pet role outputs (per pet per day, before enrichment / affinity)</h3>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Role</th><th>Base output</th><th>Species affinity bonus</th></tr></thead>
    <tbody>
      <tr><td>MINE</td><td>2 gold + 1 wood + trace iron/stone</td><td>+25% on matching biome (Fire on volcanic, Iron on any)</td></tr>
      <tr><td>FARM</td><td>3 food</td><td>+25% on matching biome (Leaf on forest)</td></tr>
      <tr><td>CRAFT (at Workshop)</td><td>1 crafted arm (converts stockpile mats)</td><td>+15% for species-appropriate crafting</td></tr>
      <tr><td>GUARD</td><td>defensive contribution scaling with fame + strength</td><td>+25% for Combat / Toxin (fighters)</td></tr>
      <tr><td>HOMESTEAD (NFT-only, passive)</td><td>Yield share, no active fight</td><td>N/A — canon rule (never defends)</td></tr>
    </tbody>
  </table></div>

  <h3>Enrichment payoff</h3>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Landowner invests CT</th><th>Pool grows</th><th>Payout</th></tr></thead>
    <tbody>
      <tr><td>Enrichment CT into a parcel's pool</td><td>Attached to land, conquest inherits</td><td>Pool pays out ~⚙12% per game-year to CURRENT governor (spread across daily ticks with integer carry)</td></tr>
    </tbody>
  </table></div>
  <ul>
    <li><strong>Landlord tax</strong> — 30% share of CT flows through your land (income to your wallet even if you're not occupying)</li>
    <li><strong>Prosperity nudge</strong> — enriched pools raise prosperity, which raises populace, which raises draft cap and lowers per-soldier cost</li>
    <li><strong>Pet migration rolls</strong> — enriched land triggers "a general arrives" pet-species migration events</li>
    <li><strong>DNA fragment drops</strong> — enriched-land yields drop pet-DNA fragments — enough fragments craft a new pet NFT blueprint</li>
  </ul>

  <h3>Consumption / upkeep (the ongoing sink)</h3>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Consumer</th><th>Rate</th><th>Consumes from</th></tr></thead>
    <tbody>
      <tr><td>Populace (civilian pop)</td><td>0.5 food / pop / day</td><td>Territory foodStock</td></tr>
      <tr><td>Garrison army</td><td>0.5 food / troop / day</td><td>Territory foodStock (friendly land) or army provisions</td></tr>
      <tr><td>Marching army</td><td>1.0 food / troop / step</td><td>Army provisions</td></tr>
      <tr><td>Battle-food (upfront)</td><td>Scaled by troops × battleFoodNeed</td><td>Army provisions (spent win or lose)</td></tr>
      <tr><td>Pet upkeep (owned, native biome)</td><td>~0.01 CT / pet / day</td><td>Territory treasury</td></tr>
      <tr><td>Pet upkeep (non-native summon)</td><td>~0.05 CT / pet / day</td><td>Territory treasury</td></tr>
    </tbody>
  </table></div>
  <p class="dim"><strong>Net-sink target:</strong> for a well-run parcel (workers assigned, workshop online, overseer alive), food/gold produced ≈ 1.05 × consumption. Slight ongoing surplus for active management. Neglect grinds you down over weeks — the world doesn't inflate CT/food/materials indefinitely.</p>

  <h3>Command-battle queue fees</h3>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Concurrent battles committed</th><th>Fee</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>1st</td><td>1 CT</td><td rowspan="5">Burns (CT sink). Cancellable before start → refund. Max 5 concurrent per player.</td></tr>
      <tr><td>2nd</td><td>3 CT</td></tr>
      <tr><td>3rd</td><td>5 CT</td></tr>
      <tr><td>4th</td><td>10 CT</td></tr>
      <tr><td>5th</td><td>20 CT</td></tr>
    </tbody>
  </table></div>

  <div class="rule" style="margin-top: 32px;">
    <strong>Reminder — these numbers will change.</strong> Everything on this page is v0.1 initial calibration for playtest. The RATIOS between items (2/3/5/10/50 gold, 50% vendor markup, 1 CT = 100 g) are the durable design contract — the actual gold/CT values may shift as we tune. Bookmark this page; check back after major balance patches.
  </div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>The dynamic marketplace — AMM per parcel</h2>
  <p>Prices don't sit still. Every parcel is its own <strong>local market</strong> with a real supply/demand curve. The system runs a constant-product AMM pool (like Uniswap) for each resource pair — buy iron, price of iron ticks up; sell iron, price ticks down. Real economics, real trade routes, real arbitrage opportunities.</p>
  <h3>Market depth scales with parcel size × enrichment</h3>
  <p>Small unenriched parcels have <strong>thin liquidity</strong> — a modest trade can swing the price 20%. Big enriched estates have <strong>deep pools</strong> — whales can trade 10,000 gold without moving the market. This is why enrichment tier matters for trading centers.</p>
  <h3>Enrichment reduces the fee spread</h3>
  <p>On top of AMM slippage, each trade pays a fee. Tier 0 land takes 25% each way (50% total spread — brokers eat well). Tier 5 land takes 5% each way (10% total spread — near-perfect market). Better commerce infrastructure = tighter margins.</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Enrichment tier</th><th>Buy fee</th><th>Sell fee</th><th>Total spread</th></tr></thead>
    <tbody>
      <tr><td>T0 (base land)</td><td>+25%</td><td>−25%</td><td>50%</td></tr>
      <tr><td>T1 (trader's tent)</td><td>+20%</td><td>−20%</td><td>40%</td></tr>
      <tr><td>T2 (market stalls)</td><td>+15%</td><td>−15%</td><td>30%</td></tr>
      <tr><td>T3 (merchant guild)</td><td>+10%</td><td>−10%</td><td>20%</td></tr>
      <tr><td>T4 (proper marketplace)</td><td>+7.5%</td><td>−7.5%</td><td>15%</td></tr>
      <tr><td>T5 (trade hub)</td><td>+5%</td><td>−5%</td><td>10%</td></tr>
    </tbody>
  </table></div>
  <h3>Emergent trade routes</h3>
  <p>Iron-rich land (mountainous, volcanic) will sit with a supply overhang — its local iron price drops toward baseline. Iron-poor land (coastal, plains) will show shortage — its price climbs above baseline. Players who occupy parcels on <em>both</em> ends can arbitrage the difference. Empire logistics becomes a real activity.</p>
  <p>The system runs an <strong>invisible balancer</strong> (100 K gold/hour globally, 100 trades/hour cap) that fixes only <em>egregious</em> gaps (≥30% price difference). It won't touch 10–25% gaps — those belong to the players.</p>
  <p class="dim">v2 (later) adds real player caravans — physical goods movement, takes real time, raidable by bandits or hostile players. v1 is the invisible-balancer.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Enrichment tiers — where your CT actually goes</h2>
  <p>Enrichment is the landowner's investment loop. All spending happens through the <strong>parcel map designer</strong> — one CT sink for everything, whether it changes the visual map or not. Nine tracks, five tiers (T0 → T5). At max tier, the land visibly becomes a city-state.</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Track</th><th>What T0→T5 unlocks</th><th>Visible on map?</th></tr></thead>
    <tbody>
      <tr><td>Populace + Fertility</td><td>Max pop 100→350, birth rate scales</td><td>No</td></tr>
      <tr><td>Apothecary / Herbs</td><td>Starvation recovery, garrison morale regen, pet healing</td><td>No</td></tr>
      <tr><td>Resource nodes</td><td>2 → 8 nodes, +25% richness per tier, rare-metal chance climbs</td><td>Yes — more mines visible</td></tr>
      <tr><td>Wild spawn quality</td><td>Elite mob chance, BOSS lairs, evolved wild pets, DNA drops</td><td>Yes — elite camps render</td></tr>
      <tr><td>Defense capacity</td><td>4 → 16 buildSpots, fortification ring grows</td><td>Yes — castle ring</td></tr>
      <tr><td>Workshop tier</td><td>None → shed → proper → advanced → grand → master (crafts named artifacts)</td><td>Yes — building grows</td></tr>
      <tr><td>Market efficiency</td><td>50% spread → 10%, AMM depth 25× deeper</td><td>Yes — market pavilion</td></tr>
      <tr><td>Weather resistance</td><td>Bad-weather penalties softer, good-weather amps stronger</td><td>No</td></tr>
      <tr><td>Fur yield</td><td>+50% shed rate at T5, rare-color fur chance climbs</td><td>No</td></tr>
    </tbody>
  </table></div>
  <h3>Investment ladder by land size</h3>
  <p>Bigger land, bigger investment, disproportionately bigger payoff.</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Size</th><th>T5 max</th><th>Dollar equivalent</th></tr></thead>
    <tbody>
      <tr><td>SINGLE parcel</td><td>12,000 CT</td><td>~$120</td></tr>
      <tr><td>MEDIUM manor</td><td>30,000 CT</td><td>~$300</td></tr>
      <tr><td>LARGE (KEEP)</td><td>100,000 CT</td><td>~$1,000</td></tr>
      <tr><td>GIANT (CASTLE)</td><td>500,000 CT</td><td>~$5,000</td></tr>
      <tr><td><strong>EPIC (PALACE)</strong></td><td><strong>2,000,000 CT</strong></td><td>~$20,000</td></tr>
    </tbody>
  </table></div>
  <p>An EPIC PALACE at T5 has ~11× the populace, ~10× the node count, ~1,000× the market depth, and hosts BOSS lairs constantly (rare-mon farming heaven). It's the biggest prize on the map — the reason warlords fight for enriched estates.</p>
  <div class="rule">
    <strong>Conquest inherits the pool.</strong> All that CT goes with the land. If you lose your EPIC PALACE, the new owner walks in with 2 million CT of infrastructure ready to go. That's the ambition loop — enrich to attract wealth and danger; win or lose everything.
  </div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Materials → arms → elites (the crafting chain)</h2>
  <p>Elite units don't come from a "hire elite" button — they come from a production chain that starts with your workers and ends at your workshop.</p>
  <ol>
    <li><strong>Worker pets MINE materials</strong> (iron, wood, fur, rare-metal, stone) into the parcel's stockpile.</li>
    <li><strong>CRAFT worker pets at your Workshop build ARMS</strong> from stockpile materials. Each arm is a specific unit's equipment (elite footman arm, elite archer arm, etc.).</li>
    <li><strong>Hire elite = pay gold + consume 1 arm + present an evolved-form (Form 2+) pet species.</strong> No arm, no elite. No evolved pet species, no elite. No shortcut.</li>
  </ol>
  <p>Arms are STORABLE + TRADEABLE — you can craft in peacetime, stockpile, sell arms at the AMM to another player who has the evolved pet but no workshop. Real production economy.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Wipe — what happens when you lose everything</h2>
  <p>There's no time-based wipe in Clash Front. The rule is simple: <strong>zero territories = you're wiped.</strong> Whether that happens because enemies took your last castle, or because you stopped playing long enough for your parcels to overgrow to WILD, the result is the same.</p>
  <ul>
    <li>All armies disband (no orphan starving soldiers on the map)</li>
    <li>All Masters go to EXILE state (still yours, no assignments)</li>
    <li>All pet deployments cleared (pets walk home)</li>
    <li>Territory stockpiles + food revert to zero (WILD takes it)</li>
    <li><strong>CT balance stays. NFT ownership stays.</strong> Money is money; blueprints are blueprints.</li>
  </ul>
  <p>Coming back? You still own your CT, your Masters, and your pet NFT blueprints. You can walk onto any WILD parcel to claim it, buy fresh land from the marketplace, or conquer your way back. The world doesn't remember you owned it — but it also doesn't hold your absence against you.</p>
  <p class="dim">This is the real-world rule: abandon too long and it's gone. Prevents dead data from inactive players, keeps the map alive for active ones.</p>
</div></section>
`;
