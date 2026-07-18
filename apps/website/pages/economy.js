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
`;
