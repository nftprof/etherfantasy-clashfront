export const title = 'Army & fortification';
export const description = 'Raise armies, provision them, garrison territory, place defense modules, hold your ground.';
export const body = `
<div class="page-head">
  <div class="wrap-narrow">
    <div class="eyebrow">Army & fortification</div>
    <h1>Raise, provision, defend</h1>
    <p class="lede">Every army is real. Every soldier costs CT. Every parcel you hold needs a Master and a plan.</p>
  </div>
</div>

<section class="slab"><div class="wrap">
  <h2>Unit classes</h2>
  <p>Seven line classes cover the whole roster. Each stack is a pet species (see <a href="/pets.html">pets</a>) — the class is the fighting role, the species is the element.</p>
  <div class="tbl-scroll"><table class="tbl">
    <thead><tr><th>Class</th><th>Role</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>INFANTRY</td><td>Line hold</td><td>Standard front rank. Cheap, dependable.</td></tr>
      <tr><td>ARCHER</td><td>Ranged</td><td>Weather-sensitive (wind arc loses accuracy). Screens for infantry.</td></tr>
      <tr><td>CAVALRY</td><td>Skirmish + flank</td><td>Speed premium. Hits routing enemies hardest.</td></tr>
      <tr><td>SPEAR</td><td>Anti-cavalry</td><td>Cheap counter to CAVALRY. Holds a line better than INFANTRY vs mounted.</td></tr>
      <tr><td>SIEGE</td><td>Structure damage</td><td>Slow. The way past walls and towers. Weak in the open.</td></tr>
      <tr><td>MARINE</td><td>Naval landing</td><td>Coastal and river warfare.</td></tr>
      <tr><td>SHIP</td><td>Naval line</td><td>Sea battles. Ports and harbors are the theatre.</td></tr>
    </tbody>
  </table></div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Raising an army</h2>
  <p>You raise from a territory you govern. Pay CT up front (split across food/gold/wood). The army enters a <strong>MUSTERING</strong> state — soldiers materialize per tick until the queue drains. A mustering army can't march, and if attacked mid-muster it fights with what's trained so far × ⚙ muster penalty.</p>
  <div class="rule"><strong>The CT re-scale (2026-07-10 v2).</strong> Everything got ÷100. A line soldier is ~0.02 CT. A level 1 development ~1–1.5 CT. Start balances are 5 CT (most players) / 50 (casual whales) / 500 (whales). At $0.10/CT, most actions cost pennies. Enrichment matters because it changes the cost math over time.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Resources</h2>
  <div class="split">
    <div>
      <h3>CT (outside the battle)</h3>
      <p>The currency. On Pentagon Chain. You deposit CT into the game via escrow, spend it on land actions, and can only withdraw what you deposited (never more) — the game is a house-edged, negative-sum CT machine on the withdrawal side.</p>
    </div>
    <div>
      <h3>Gold (inside the battle)</h3>
      <p>Mined from map resource nodes during a fight. Spent in-battle building towers, walls, gates, hiring elite units. Round-trips out at end of battle: your final Gold survivors become plunder (translated back to CT at the fixed rate).</p>
    </div>
  </div>
  <p><strong>Food / Wood</strong> — carried on your army as provisions. Food is burned on march-steps and consumed in battle-food up front. Wood + gold together can erect a temporary in-battle command center that gives your side a scoring bonus (spent win or lose).</p>
  <p class="dim">The formal CT ↔ Gold bridge spec is pending — round-trip prices in matches must equal round-trip prices out (spend 100g on a tower → recover ~100g on plunder).</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Fortification — the ladder + your placements</h2>
  <p>Every parcel ships with a <strong>fortification ladder</strong> baked into its battlefield JSON:</p>
  <ul>
    <li><strong>SMALL / open single</strong> — nothing baked. All defense is what you place.</li>
    <li><strong>MEDIUM manor</strong> — nothing baked unless it's a town anchor.</li>
    <li><strong>LARGE — KEEP</strong> — wall + gate + tower ring pre-placed.</li>
    <li><strong>GIANT — CASTLE</strong> — heavier ring.</li>
    <li><strong>EPIC — PALACE</strong> — full palace geometry (per-component board).</li>
  </ul>
  <p>Beyond the ladder, every generated map ships with <strong>buildSpots</strong> — empty slots where you (the defender) can place your own modules:</p>
  <ul>
    <li><strong>Auto-upgrade defense</strong> (default) — slots fill in priority order as your MILITARY development level climbs. No thinking required.</li>
    <li><strong>Manual placement</strong> (advanced) — drag modules onto the exact slots you want (CoC-style base builder).</li>
  </ul>
  <p>Module types: <strong>WALL</strong> · <strong>TOWER</strong> · <strong>GATE</strong> · <strong>TRAP</strong> · <strong>GRANARY</strong> · <strong>PET_DEN</strong>. All destructible. Attackers who break them can salvage materials.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Overseer requirement</h2>
  <p>Every occupied parcel needs a Master overseer while you hold it. No overseer = no active production, and — over time — <strong>overgrowth</strong> creeps in and the land reverts to WILD.</p>
  <p>Assign a Master, keep her fed and paid, and the land yields. Neglect it and the frontier takes it back.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Supply lines</h2>
  <p>An army in the field needs supply. GARRISON in a friendly supplySource territory = supplied. Marching or standing on foreign ground = drain. Long unsupplied stretches bleed morale, and morale collapse = desertion.</p>
  <p>Supply-train raiding, empireFactor / distanceFactor, and the full 01 §5.2 Dijkstra check are in the queue — see <a href="/roadmap.html">roadmap</a>.</p>
</div></section>
`;
