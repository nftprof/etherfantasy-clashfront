export const title = 'Masters';
export const description = '52 rentable Masters + 3 heroes. Character NFTs that lead armies on the overworld and fight as champions in-battle.';
export const body = `
<div class="page-head">
  <div class="wrap-narrow">
    <div class="eyebrow">The champions</div>
    <h1>Fifty-five commanders — and every one is somebody's</h1>
    <p class="lede">Masters are the Ether Fantasy character NFTs — 52 you can rent, 3 heroes. They lead your armies on the overworld map, and when a battle goes live you play as one of them inside the 3D engine.</p>
  </div>
</div>

<section class="slab"><div class="wrap">
  <h2>What a Master IS</h2>
  <p>A Master = one character NFT (owned or rented) mirrored from the live Ether Fantasy Masters API. In CF, a Master:</p>
  <ul>
    <li><strong>Oversees a territory</strong> — one Master per parcel; required while a player owns the land.</li>
    <li><strong>Leads an army</strong> — the "leading officer" on a marching army. Their fame contributes to WarScore (capped at 20% hero impact).</li>
    <li><strong>Is your champion in battle</strong> — when a battle goes live, you enter as your Master via the normal champion draft.</li>
    <li><strong>Can be KO'd</strong> — via the live Masters API. KO'd Masters enter a revive cycle; standing orders persist.</li>
  </ul>
  <div class="rule"><strong>One hero per user.</strong> Multiple Masters can fight on one battle map; a player embodies exactly one at a time. Switching heroes requires returning to command mode. So the MOBA client can forever assume "one player, one hero."</div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Masters are element-free</h2>
  <p>Masters carry no elemental type — no fire hero, no water hero. Element play lives in your <strong>pet/soldier selection</strong> (a UnitClass stack IS a pet species). Masters benefit from their squads' element buffs indirectly, never directly.</p>
  <p>Result: hero picks stay about skill, style, and matchup — not counter-picking a weather day. Element strategy is the composition question, decided when you build your army.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Owned vs rented</h2>
  <div class="split">
    <div>
      <h3>Owned</h3>
      <p>You bought the NFT. Full control, full lifetime, no expiry. Your name against their portrait forever. Great deeds inscribed at the sites where they earned them.</p>
    </div>
    <div>
      <h3>Rented</h3>
      <p>Short-term rental via the Masters API. Costs less, expires at rental end. Reconciles on login: still-owned Masters keep their assignments; expired Masters stay until they finish their current army before being released.</p>
    </div>
  </div>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Hero-vs-hero duels</h2>
  <p>Sometimes armies aren't needed. Two Masters standing alone on the same land can settle it 1-on-1 — champions decide, troops are spared.</p>
  <ul>
    <li><strong>v1 (now):</strong> a card fight (AGGRESSIVE > TRICK > DEFENSIVE > AGGRESSIVE), best-of-3 exchanges, decided by your Master's real rating + HP + equipped artifact spellflares. Animated head-shot fight with real portraits. Turn-based over WebSocket — snappy round transitions, no networking overhead.</li>
    <li><strong>v2+ (upcoming):</strong> tiny-arena live 1v1 on the 3D engine.</li>
  </ul>
  <p><strong>When you win, you choose:</strong></p>
  <ul>
    <li><strong>RELEASE (default)</strong> — the loser's Master walks back to their governor's undeployed pool. They can redeploy immediately. Merciful. Fires automatically if you don't pick within 10 seconds.</li>
    <li><strong>KNOCK OUT</strong> — animated K.O. (eyes shut, head slumps, screen dims) → Master enters KO state via the live Masters API. Their owner has to revive them before using them again. Brutal.</li>
  </ul>
  <p>Winner takes the ground. Result is public — the World Chronicle records it as a great-deed style beat.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Mythic reinforcement — the pet-companion parallel</h2>
  <p>Masters aren't the only legendary help. If you own a <strong>Mythic pet NFT</strong>, that pet may appear as a special reinforcement in one of your battles — <strong>once every 10 battles, guaranteed</strong> (not random — planable). It arrives at your spawn zone with a shaft-of-light effect and a banner:</p>
  <ul>
    <li>Your side sees: <strong>"⭐ The Gods have answered — {Name} arrives!"</strong></li>
    <li>The enemy sees: <strong>"⚠ The sky darkens — something is powering the enemy. Be prudent."</strong></li>
  </ul>
  <p>Mythic reinforcements are <strong>roughly 2× a hero's stats</strong> — big HP tank + hard-hitting damage — but they have <strong>no skills</strong>. They behave like a very durable line soldier under default AI. No player micro needed. Own multiple Mythic NFTs? Each has its own independent 10-battle cooldown.</p>
  <div class="rule"><strong>Bonus loot on KO.</strong> If the enemy kills your mythic, a boss-style loot drop appears at the KO location — first player to grab it wins the rewards (rare-metal, gold, chance at Singular tokens). The Chronicle records the kill permanently: "{killer name} felled the Mythic {mythic name} at {battle name}."</p>
  <p class="dim">5 mythic species are 3D-ready today: Zedakazm (dragon-phantom flyer), Quadrossal (telepath), Vernirox (earth-rock tank), Mytier and Vaudequin (fire cannons). Full spec on the <a href="/army.html">Army page</a>.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Signature artifacts — the elemental aura</h2>
  <p>Masters are element-free themselves (decision 14). But their <strong>equipped signature artifact</strong> grants an <strong>elemental aura</strong> to matching-element soldiers in the army they lead.</p>
  <p>Example: your Master equips a Flame Scimitar (Fire artifact). Every Fire-species soldier stack in her army fights at +10% while she's alive. Other elements get nothing. Her own combat contribution stays element-free.</p>
  <p class="dim">Aura stacks with weather × terrain into the same ±35% combined cap — one budget, three sources. Named/legendary artifacts (Singulars) may bump aura higher; mundane weapon artifacts stay at the +10% baseline. Aura is the way Masters shape element strategy without violating "elements live on pet selection."</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Master's Sickness — the RTS mode</h2>
  <p>In some game modes, Masters enter the fight <strong>weakened</strong> — 50% or even 80% reduced stats. It's not a bug; it's a mode. When your hero is throttled, you have to win by economy: gather materials, build towers, out-produce the enemy, out-formation them.</p>
  <p>This flips the MOBA/RTS balance: instead of hero-carry, it's macro-carry. Owner call per-Master via <code>battleStyle: HERO_HEAVY / BALANCED / MACRO</code> + per-battle <code>heroDebuff: 0..1</code>.</p>
  <p class="dim">Spec: <a href="/battles.html">battles page</a> — the RTS layer is the same for MOBA-PvP and CF battles.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>A few from the roster</h2>
  <p class="dim">Full list via the Masters API. A sample from the 47 base Masters + 3 heroes we've built demo art for:</p>
  <div class="portraits">
    <div class="portrait"><img src="/assets/img/irene.png" alt="Irene"><div class="name">Irene</div></div>
    <div class="portrait"><img src="/assets/img/kai.png" alt="Kai"><div class="name">Kai</div></div>
    <div class="portrait"><img src="/assets/img/leah.png" alt="Leah"><div class="name">Leah</div></div>
    <div class="portrait"><img src="/assets/img/master1.jpg" alt="Master"><div class="name">Master</div></div>
    <div class="portrait"><img src="/assets/img/master2.jpg" alt="Master"><div class="name">Master</div></div>
    <div class="portrait"><img src="/assets/img/master3.jpg" alt="Master"><div class="name">Master</div></div>
  </div>
  <p class="dim">Portraits shown are demo head-shots for the card duel v1.</p>
</div></section>

<section class="slab"><div class="wrap">
  <h2>Standing orders (offline-proof)</h2>
  <p>You're not always online. Set your Master's default behavior once, and the sim honors it while you're away:</p>
  <ul>
    <li><strong>DUEL</strong> — challenge any lone Master who walks on your land</li>
    <li><strong>FLEE</strong> — attempt escape; caught only if rating fails the roll</li>
    <li><strong>STAND</strong> — accept OVERWHELM if outnumbered (lose a few soldiers; your Master KO'd)</li>
  </ul>
</div></section>
`;
