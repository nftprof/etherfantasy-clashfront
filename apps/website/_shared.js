// Shared header/footer HTML — inlined into each page by build.mjs so the
// deployed site remains purely static (no client fetch, no include). Edit here,
// run `node build.mjs`, commit the regenerated pages.

export const HEADER = ({ page = '' } = {}) => `<!-- BEGIN header -->
<div class="dev-ribbon">
  <div class="wrap">
    <strong>PRE-ALPHA</strong>
    <span>MVP demo live · World simulation in build · Public playtest TBA</span>
  </div>
</div>
<header class="site">
  <div class="wrap">
    <a href="/" class="brand"><img src="/assets/img/ef-icon-256.png" alt="EtherFantasy">Clash Front <span>· Ether Fantasy</span></a>
    <button class="nav-toggle" aria-label="Toggle navigation">☰</button>
    <nav class="primary">
      <a href="/">Home</a>
      <a href="/world.html">World</a>
      <a href="/battles.html">Battles</a>
      <a href="/masters.html">Masters</a>
      <a href="/pets.html">Pets</a>
      <a href="/army.html">Army</a>
      <a href="/nft.html">NFTs</a>
      <a href="/weather.html">Weather</a>
      <a href="/servers.html">Servers</a>
      <a href="/roadmap.html">Roadmap</a>
      <a href="/getting-started.html">Start</a>
    </nav>
  </div>
</header>
<!-- END header -->`;

export const FOOTER = () => `<!-- BEGIN footer -->
<footer class="site">
  <div class="wrap">
    <span class="foot-brand">Clash Front</span>
    <span>· The dominion war game of the EtherFantasy realm — the Masters own the world</span>
    <span style="margin-left:auto;">
      <a href="https://etherfantasy.com">etherfantasy.com</a>
      · <a href="https://etherfantasy.com/world">The World</a>
      · <a href="https://pets.etherfantasy.com/populace/">The Populace</a>
      · <a href="/roadmap.html">Roadmap</a>
    </span>
  </div>
</footer>
<script src="/assets/site.js"></script>
<!-- END footer -->`;

export function wrapHtml({ title, description, body, page }) {
  const desc = description ?? 'Clash Front — the grand-strategy war layer of Ether Fantasy.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Clash Front</title>
  <meta name="description" content="${desc}">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body>
${HEADER({ page })}
<main>
${body}
</main>
${FOOTER()}
</body>
</html>
`;
}
