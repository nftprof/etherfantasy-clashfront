/* Ether Fantasy · Land — shared page shell (overhaul A2, 2026-10-19).
   Injects the header (brand · nav · auth pill), footer and toast host on every map-service page,
   and exposes window.EFShell = { ready, who, toast(msg,kind), onAuth(cb), authHeaders() }.
   Opt into a compact chrome for full-screen tools with <body class="ef" data-ef-shell="minimal">. */
(function () {
  "use strict";
  if (window.EFShell) return;

  const NAV = [
    { href: "/", label: "Home", match: (p) => p === "/" || p === "/welcome" },
    { href: "/designer/world", label: "World Atlas", match: (p) => p.startsWith("/designer/world") },
    { href: "/designer", label: "Designer", match: (p) => p === "/designer" || p === "/designer/" || p.startsWith("/designer/3d") },
    { href: "/designer/decks", label: "Sky Cities", match: (p) => p.startsWith("/designer/decks") },
    { href: "/#get-land", label: "Get Land", match: () => false },
  ];
  const GAME_URL = "https://clashfront.etherfantasy.com/";

  // brand mark: a hex parcel with an ether core + crystal edge (Hexagon City heritage)
  const MARK = `<svg class="ef-brand-mark" viewBox="0 0 32 32" aria-hidden="true">
    <defs><linearGradient id="efm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfa6ff"/><stop offset=".55" stop-color="#a855f7"/><stop offset="1" stop-color="#5fe9d0"/></linearGradient></defs>
    <path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25Z" fill="none" stroke="url(#efm-g)" stroke-width="2"/>
    <path d="M16 8.5 22.5 12.25v7.5L16 23.5l-6.5-3.75v-7.5Z" fill="url(#efm-g)" opacity=".9"/>
    <path d="M16 8.5v15M9.5 12.25 22.5 19.75M22.5 12.25 9.5 19.75" stroke="#07060d" stroke-width="1" opacity=".55"/></svg>`;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };

  function authHeaders() {
    const h = {}; const t = store("ef_pg_token"), w = store("ef_mm_wallet");
    if (t) h.authorization = "Bearer " + t;
    if (w) h["x-wallet"] = w;
    return h;
  }

  function fonts() {
    if (document.querySelector("link[data-ef-fonts]")) return;
    const pre = document.createElement("link"); pre.rel = "preconnect"; pre.href = "https://fonts.gstatic.com"; pre.crossOrigin = "";
    const l = document.createElement("link"); l.rel = "stylesheet"; l.dataset.efFonts = "1";
    l.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&display=swap";
    document.head.append(pre, l);
  }

  function header(minimal) {
    const p = location.pathname;
    const links = NAV.map((n) => `<a href="${n.href}"${n.match(p) ? ' class="is-active" aria-current="page"' : ""}${n.label === "Get Land" ? ' data-ef-getland="1"' : ""}>${n.label}</a>`).join("");
    const el = document.createElement("header");
    el.className = "ef-header" + (minimal ? " ef-header--minimal" : "");
    el.innerHTML = `<div class="ef-container">
      <a class="ef-brand" href="/" aria-label="Ether Fantasy Land — home">${MARK}<span><span class="ef-brand-name">ETHER FANTASY</span><span class="ef-brand-sub">LAND · HEXAGON CITY</span></span></a>
      <nav class="ef-nav" aria-label="Primary">${links}</nav>
      <div class="ef-auth" id="ef-auth"><a class="ef-btn ef-btn--ghost ef-btn--sm" href="${GAME_URL}" target="_blank" rel="noopener">Play Clash Front ↗</a><a class="ef-btn ef-btn--primary ef-btn--sm" href="/designer#signin" id="ef-signin">Sign in</a></div>
      <button class="ef-menu-btn" type="button" aria-label="Menu" aria-expanded="false">☰</button>
    </div>`;
    el.querySelector(".ef-menu-btn").addEventListener("click", (e) => {
      const open = el.classList.toggle("is-open"); e.currentTarget.setAttribute("aria-expanded", String(open));
    });
    return el;
  }

  function footer() {
    const el = document.createElement("footer");
    el.className = "ef-footer";
    el.innerHTML = `<div class="ef-container">
      <div class="ef-footer-grid">
        <div><a class="ef-brand" href="/">${MARK}<span><span class="ef-brand-name">ETHER FANTASY</span><span class="ef-brand-sub">LAND · HEXAGON CITY</span></span></a>
          <p style="margin:14px 0 0;max-width:340px">Own a piece of a persistent fantasy world. Every parcel is a real battlefield in Clash Front — and you decide what it looks like.</p></div>
        <div><h4>Explore</h4><a href="/designer/world">World Atlas</a><a href="/designer">Land Designer</a><a href="/designer/decks">Sky Cities</a></div>
        <div><h4>Land</h4><a href="/#get-land">How to get land</a><a href="/#why-land">Why own land</a><a href="/#faq">FAQ</a></div>
        <div><h4>Ether Fantasy</h4><a href="${GAME_URL}" target="_blank" rel="noopener">Play Clash Front ↗</a><a href="https://etherfantasy.com" target="_blank" rel="noopener">etherfantasy.com ↗</a></div>
      </div>
      <div class="ef-footer-base"><span>© ${new Date().getFullYear()} Pentagon Games · Ether Fantasy</span><span>Estates on Ethereum · Parcels on Polygon</span></div>
    </div>`;
    return el;
  }

  function toastHost() {
    let h = document.querySelector(".ef-toasts");
    if (!h) { h = document.createElement("div"); h.className = "ef-toasts"; h.setAttribute("role", "status"); h.setAttribute("aria-live", "polite"); document.body.append(h); }
    return h;
  }
  function toast(msg, kind, ms) {
    const t = document.createElement("div");
    t.className = "ef-toast" + (kind ? " ef-toast--" + kind : "");
    t.textContent = msg;
    toastHost().append(t);
    setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, ms || 3600);
  }

  const authCbs = [];
  let who = null;
  function renderAuth(w) {
    const box = document.getElementById("ef-auth");
    if (!box || !w || !w.ok) return;
    const name = w.username || (w.wallet ? w.wallet.slice(0, 6) + "…" + w.wallet.slice(-4) : "Signed in");
    const initial = esc((w.username || w.wallet || "?").replace(/^0x/, "").slice(0, 1).toUpperCase());
    box.innerHTML = `${w.admin ? '<span class="ef-pill ef-pill--admin ef-pill--plain" title="Full access to every parcel and feature">👑 Admin</span>' : ""}
      <a class="ef-user" href="/designer" title="Open your land in the Designer"><span class="ef-avatar">${initial}</span>${esc(name)}</a>`;
  }
  const ready = fetch("/internal/v1/whoami", { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : { ok: false }))
    .catch(() => ({ ok: false }))
    .then((w) => { who = w; window.EFShell.who = w; renderAuth(w); authCbs.forEach((cb) => { try { cb(w); } catch {} }); return w; });

  function mount() {
    const body = document.body;
    if (!body.classList.contains("ef")) body.classList.add("ef");
    const minimal = body.dataset.efShell === "minimal";
    const slotH = document.getElementById("ef-header");
    const h = header(minimal);
    if (slotH) slotH.replaceWith(h); else body.prepend(h);
    if (!minimal && !body.dataset.efNoFooter) {
      const slotF = document.getElementById("ef-footer");
      if (slotF) slotF.replaceWith(footer()); else body.append(footer());
    }
    // "Get Land" from any page → the landing section; on the landing itself just scroll
    const gl = h.querySelector("[data-ef-getland]");
    if (gl && (location.pathname === "/" || location.pathname === "/welcome")) gl.addEventListener("click", (e) => {
      const t = document.getElementById("get-land"); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: "smooth" }); }
    });
    if (who) renderAuth(who);
  }

  window.EFShell = {
    ready, who: null, toast, authHeaders,
    onAuth(cb) { if (who) cb(who); else authCbs.push(cb); },
    refreshAuth() { return fetch("/internal/v1/whoami", { headers: authHeaders() }).then((r) => r.json()).then((w) => { who = w; window.EFShell.who = w; renderAuth(w); return w; }).catch(() => null); },
  };
  fonts();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
