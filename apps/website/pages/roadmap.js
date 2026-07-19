export const title = 'Roadmap';
export const description = 'What is live, what is building, what is coming later. Honest development status for Clash Front.';
export const body = `
<div class="page-head">
  <div class="wrap-narrow">
    <div class="eyebrow">Roadmap</div>
    <h1>Where the build actually is</h1>
    <p class="lede">Clash Front is pre-alpha. This page tells you what runs today, what's under active build, and what's on the deck for later — no hype, no vaporware.</p>
  </div>
</div>

<section class="slab"><div class="wrap">
  <h2>Live now</h2>
  <div class="grid">
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>The world moves</h3>
      <p>The overworld sim ticks forward on its own. Armies march step-by-step across the parcel graph, armies collide, battles resolve, land changes hands. Replays are deterministic — same seed, same outcome, forever.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Live 3D battles</h3>
      <p>Every collision opens a real battle on the 3D engine — you can watch it live or drop in as your Master. Command mode + hero mode both work end-to-end. Battles that nobody watches resolve headless.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Command mode UX</h3>
      <p>Watch, order, steer. Stances, standing orders, FLEE, Master recall, keyboard shortcuts, HP bars, damage floats, kill feed, advisor toasts — the command view is playable and fun to watch.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Fog of war</h3>
      <p>You see what your scouts + territories can see. Everything else is fuzzy memory or unknown. Ownership changes stay public — the world map always tells you who holds what.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Wild raids + town walk-ins</h3>
      <p>Monster lairs spawn raiders that march at your borders. Undefended towns can be walked into (choose PILLAGE for loot or OCCUPY to keep the land). The frontier isn't quiet.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Basic economy</h3>
      <p>Food production, land enrichment, wallet trickle, development levels + raze salvage. The economic skeleton is in and running.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Pentagon Games sign-in</h3>
      <p>Login with your Pentagon Games account. Your Masters roster syncs live from your wallet — you command only the ones you own or rent.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Battle replays</h3>
      <p>Every battle you've been involved in gets saved to a bounded review ring. Scrub the strength timeline, replay the fight, or auto-advance through everything you missed.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Retreat, FLEE, and the pincer</h3>
      <p>Both sides can flee. The battle map's exit edges match the overworld's adjacency. Get caught with an occupied came-from and you're pincered — a new battle spawns whether you like it or not.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Mid-battle reinforcement</h3>
      <p>Marching to a battle already in progress? Your army queues at the arrival edge as a reinforcement offer. Same-side arrivals bolster the lane; approach from a fresh edge to open a new one.</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>Hero-vs-hero duels</h3>
      <p>Two lone Masters can settle it 1-on-1: a card fight using their real stats + HP + equipped spells. Winner picks RELEASE (loser walks home) or KNOCK OUT (revive cycle applies).</p>
    </div>
    <div class="card status-done">
      <span class="tag-chip ok">Live</span>
      <h3>World map + travel routes</h3>
      <p>12 continents rendered, sky and underworld travel routes drawn, Kraken drag lanes visible. The world map shows where you can go and how you get there.</p>
    </div>
  </div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Building now</h2>
  <div class="grid">
    <div class="card status-build">
      <span class="tag-chip gold">Building</span>
      <h3>The full world at scale</h3>
      <p>Every one of the 292,766 parcels needs its own designed battlefield. The design tool + generator are locked; the mass production run is next.</p>
    </div>
    <div class="card status-build">
      <span class="tag-chip gold">Building</span>
      <h3>Weather + element combat</h3>
      <p>Rain, storm, fog, snow, heatwave, wind — rolling per continent per day. Water pets stronger in rain, Fire pets weaker. The visuals are live; the combat multiplier lands next.</p>
    </div>
    <div class="card status-build">
      <span class="tag-chip gold">Building</span>
      <h3>The v1 battle contract</h3>
      <p>Every fight settles against one clean strength number — weather × terrain × hero artifact × morale × food × fame all fold in before the fight starts. Simpler math, snappier balancing.</p>
    </div>
    <div class="card status-build">
      <span class="tag-chip gold">Building</span>
      <h3>Loot + wild bosses</h3>
      <p>Wild land already has monsters + bosses. The loot pack — what you get for beating them + how it flows back into your inventory — is landing next.</p>
    </div>
    <div class="card status-build">
      <span class="tag-chip gold">Building</span>
      <h3>Everyone sees the same map</h3>
      <p>Fixing a bug where two players in the same battle sometimes saw different floor colors. The server hands down the seed; every viewer's client reads the same numbers.</p>
    </div>
  </div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Coming later</h2>
  <p class="dim">These are designed and specified. They just haven't been built yet.</p>
  <div class="grid">
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Worker pets — mine, farm, craft</h3>
      <p>Assign your pets to a role on a parcel: mine gold + wood + iron + fur, farm food, craft weapons and armor at a workshop, guard the land. The full extraction loop.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Farming + populace</h3>
      <p>Food production per land, populace that grows with prosperity and starves without. The economic bedrock — everything else scales off it.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Crafting arms</h3>
      <p>Turn mined materials into equipped weapons and armor at a workshop. Line + elite tiers. Named artifacts for the Singulars.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Tax cycles</h3>
      <p>Regular taxes drawn from populace to your treasury. The landlord side of the economy — passive income from the land you hold.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Enrichment payoff</h3>
      <p>Spending CT into land enrichment already works. What's coming: the full "more enrichment → more populace → bigger draft cap → cheaper soldiers" loop, all connected.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>The World Remembers</h3>
      <p>Great battles auto-name themselves after where they happened and archive to a public feed. Monuments drop at the sites. First-deed inscriptions in your name — permanently, at the location.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Owner-designed towns</h3>
      <p>Player-owned port-like special locations. Markets, inns, treasure-hunt CT gamble. No-war windows override battle rules for a fixed time after occupation change.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Estate campaigns</h3>
      <p>Big estates (LARGE, GIANT, EPIC) fight as one board — many armies converging on one command view. Fixed points inside can open live 3D matches that feed back into the board result.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Diplomacy</h3>
      <p>Guilds + alliances + real diplomatic states (war, truce, ally, vassal). Mercenary contracts, bounties, escort missions, trade leases — the political layer.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Named artifacts in play</h3>
      <p>36 legendary Singulars exist in the world's data. Full pickup / bind / inscription mechanics land with the World Remembers system.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>Public playtest</h3>
      <p>The world is live at demo scale today. Public open-world playtest opens once the mass map generation ships and the economy loop runs end-to-end. No date until those land.</p>
    </div>
    <div class="card status-later">
      <span class="tag-chip">Coming</span>
      <h3>The Etheric Convergence</h3>
      <p>The far horizon, named: world events where a Mythic wakes across every window at once — the war map, the hunt, and mapped real-world places. The continents already answer to real cities; the rest is being built toward this.</p>
    </div>
  </div>
</div></section>
`;
