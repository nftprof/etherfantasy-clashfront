#!/usr/bin/env node
// landing_media.mjs — builds the landing page's media from the REAL engine (overhaul B2/B7, 2026-10-19).
//
//   node tools/landing_media.mjs --test     one frame per scene → <scratch>/scene-N.png (camera tuning)
//   node tools/landing_media.mjs --video    media/showcase.webm + media/showcase-poster.webp
//   node tools/landing_media.mjs --stills   media/continents/<ZONE>.webp, media/tool-*.webp, media/og-card.png
//   node tools/landing_media.mjs --mosaics  media/mosaics/<ZONE>.<mode>.<fp>.webp — light Designer base maps (run ON the box)
//
// The video is FRAME-STEPPED, not screen-recorded: each frame places the camera exactly via the
// /designer/3d?showcase=1 hook (window.__CF_SHOW.setOrbit), waits for the render, screenshots, and
// pipes a JPEG into Playwright's bundled ffmpeg (VP8 webm; that build only decodes MJPEG). So it's smooth at any renderer speed and
// reproducible. Captions + fades are a DOM overlay painted into the frames (that ffmpeg build has no
// blend filters). Needs the map service running (MAPS_BASE, default http://localhost:8150).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// playwright-core: the box installs it next to the service (map-deploy.yml); this sandbox has a global copy
let pw; try { pw = (await import("playwright-core")).default; } catch { pw = (await import("/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js")).default; }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MEDIA = path.join(ROOT, "media");
const BASE = process.env.MAPS_BASE || "http://localhost:8150";
const FFMPEG = process.env.FFMPEG || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux";
const W = 1280, H = 720, FPS = 24;
const ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

// the reel: real castle estates across the three tiers (sky · surface · underworld)
const SCENES = [
  { parcel: "3050435", title: "The Ember Throne", place: "Emberfall · Sky isles", secs: 4, theta: [0.35, 1.25], phi: 1.0, dist: 225 },
  { parcel: "1040345", title: "The Aeropolis", place: "Aeropolis · Sky isles", secs: 4, theta: [2.2, 3.05], phi: 0.98, dist: 245 },
  { parcel: "1071732", title: "The Vermilion Palace", place: "Tianxia · Surface realms", secs: 4, theta: [3.9, 4.75], phi: 1.0, dist: 245 },
  { parcel: "1060463", title: "The Sanctum of Empyrea", place: "Empyrea · Sky isles", secs: 4, theta: [5.1, 5.95], phi: 0.95, dist: 250 },
  { parcel: "1101100", title: "The Bastion of Dominus", place: "Blackmere · Underworld", secs: 4, theta: [0.9, 1.75], phi: 1.02, dist: 235 },
];
const FADE = 10; // frames of fade in/out per scene

const OVERLAY_JS = `(() => {
  const st = document.createElement('style');
  st.textContent = '#ef-cap{position:fixed;left:56px;bottom:52px;z-index:99;font-family:Inter,system-ui,sans-serif;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.7);opacity:0}'
   + '#ef-cap .p{font:600 13px/1 Inter,system-ui,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#5fe9d0;margin-bottom:10px}'
   + '#ef-cap .t{font:700 40px/1.05 Cinzel,Georgia,serif;letter-spacing:.02em}'
   + '#ef-fade{position:fixed;inset:0;z-index:100;background:#07060d;pointer-events:none;opacity:1}'
   + '#ef-vig{position:fixed;inset:0;z-index:98;pointer-events:none;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(7,6,13,.55) 100%),linear-gradient(0deg,rgba(7,6,13,.55),transparent 35%)}';
  document.head.append(st);
  for (const id of ['ef-vig','ef-cap','ef-fade']) { const d = document.createElement('div'); d.id = id; document.body.append(d); }
})();`;

async function openScene(page, s, tries = 3) {
  for (let t = 1; ; t++) {
    try { return await openSceneOnce(page, s); }
    catch (e) { if (t >= tries) throw e; console.log(`  retry ${s.parcel} (${e.message.split("\n")[0]})`); }
  }
}
async function openSceneOnce(page, s) {
  await page.goto(`${BASE}/designer/3d?parcel=${s.parcel}&showcase=1`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__CF_SHOW && window.__CF_SHOW.ready, null, { timeout: 60000 });
  await page.waitForTimeout(2500);                           // textures / floor tiles settle
  await page.evaluate(OVERLAY_JS);
  await page.evaluate(([t, p]) => { const c = document.getElementById("ef-cap"); c.innerHTML = `<div class="p">${p}</div><div class="t">${t}</div>`; }, [s.title, s.place]);
}
async function frame(page, s, i, n) {
  const k = n > 1 ? i / (n - 1) : 0;
  const ease = k * k * (3 - 2 * k);                          // smoothstep camera motion
  const theta = s.theta[0] + (s.theta[1] - s.theta[0]) * ease;
  const fade = Math.max(0, 1 - Math.min(i, n - 1 - i) / FADE);   // black in/out
  const cap = Math.min(1, Math.max(0, (i - FADE) / 12)) * Math.min(1, Math.max(0, (n - 1 - FADE - i) / 12));
  await page.evaluate(([th, ph, d, f, c]) => {
    window.__CF_SHOW.setOrbit(th, ph, d, 6);
    document.getElementById("ef-fade").style.opacity = f;
    document.getElementById("ef-cap").style.opacity = c;
  }, [theta, s.phi, s.dist, fade, cap]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.screenshot({ type: "jpeg", quality: 92 });
}

// PNG/JPEG buffer → webp file, via the browser's encoder (this ffmpeg build has no webp/jpeg encoders)
async function toWebp(page, pngBuf, outFile, maxW, quality = 0.82, keyBg = false) {
  const mime = pngBuf[0] === 0xff && pngBuf[1] === 0xd8 ? "image/jpeg" : "image/png";
  const data = await page.evaluate(async ([b64, mw, q, m, key]) => {
    const img = new Image(); img.src = "data:" + m + ";base64," + b64; await img.decode();
    const sc = Math.min(1, mw / img.naturalWidth);
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
    if (key) { // mosaics bake on an opaque backdrop: flood-fill it from the edges → transparent
      const W = c.width, H = c.height, id = x.getImageData(0, 0, W, H), d = id.data;
      const r0 = d[0], g0 = d[1], b0 = d[2], tol = 14, seen = new Uint8Array(W * H), st = [];
      const near = (i) => Math.abs(d[i] - r0) <= tol && Math.abs(d[i + 1] - g0) <= tol && Math.abs(d[i + 2] - b0) <= tol;
      for (let i = 0; i < W; i++) st.push(i, (H - 1) * W + i);
      for (let j = 0; j < H; j++) st.push(j * W, j * W + W - 1);
      while (st.length) { const k = st.pop(); if (seen[k]) continue; seen[k] = 1; if (!near(k * 4)) continue; d[k * 4 + 3] = 0;
        const px = k % W, py = (k - px) / W;
        if (px > 0) st.push(k - 1); if (px < W - 1) st.push(k + 1); if (py > 0) st.push(k - W); if (py < H - 1) st.push(k + W); }
      x.putImageData(id, 0, 0);
    }
    return c.toDataURL("image/webp", q).split(",")[1];
  }, [pngBuf.toString("base64"), maxW, quality, mime, keyBg]);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(data, "base64"));
  return fs.statSync(outFile).size;
}

async function video(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  fs.mkdirSync(MEDIA, { recursive: true });
  const out = path.join(MEDIA, "showcase.webm");
  // this ffmpeg build (Playwright's) decodes MJPEG only and reads stdin via pipe:0 — same as its own recorder
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0",
    "-c:v", "vp8", "-b:v", "2400k", "-crf", "10", "-qmin", "4", "-qmax", "42", "-deadline", "good", "-cpu-used", "1",
    "-pix_fmt", "yuv420p", "-an", out], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c)))));
  let poster = null, total = 0;
  for (const s of SCENES) {
    await openScene(page, s);
    const n = Math.round(s.secs * FPS);
    for (let i = 0; i < n; i++) {
      const png = await frame(page, s, i, n);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (!poster && i === Math.round(n * 0.55)) poster = png;
      total++;
      if (i % 24 === 23) console.log(`    ${s.parcel} frame ${i + 1}/${n}`);
    }
    console.log(`  scene ${s.parcel} ${s.title}: ${n} frames`);
  }
  ff.stdin.end(); await done;
  const pb = path.join(MEDIA, "showcase-poster.webp");
  console.log(`showcase.webm ${(fs.statSync(out).size / 1e6).toFixed(2)} MB · ${total} frames · ${(total / FPS).toFixed(1)}s`);
  console.log(`showcase-poster.webp ${(await toWebp(page, poster, pb, 1600, 0.8) / 1e3).toFixed(0)} KB`);
  await page.close();
}

async function test(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const dir = process.env.SCRATCH || "/tmp";
  for (const [k, s] of SCENES.entries()) {
    await openScene(page, s);
    const png = await frame(page, s, Math.round(s.secs * FPS * 0.5), Math.round(s.secs * FPS));
    fs.writeFileSync(path.join(dir, `scene-${k}.png`), png);
    console.log(`scene-${k}.png ${s.parcel} ${s.title}`);
  }
  await page.close();
}

// light Designer base maps (polish S2): 1600px webp per zone × mode, named by the mosaic fingerprint the
// SERVING host reports — so run it against the box itself (map-deploy.yml does, after its re-bake). A miss
// (re-bake, or never run) just makes the Designer fall back to the full PNG.
async function liteMosaics(browser) {
  const page = await browser.newPage(); await page.goto(`${BASE}/healthz`);
  const st = await (await fetch(`${BASE}/internal/v1/landing-stats`)).json();
  const dir = path.join(MEDIA, "mosaics"); fs.rmSync(dir, { recursive: true, force: true });
  for (const z of st.zones.filter((z) => z.charted)) for (const mode of ["planner", "thumb"]) {
    const m = await (await fetch(`${BASE}/internal/v1/mosaic.json?zone=${z.zoneId}&mode=${mode}`)).json();
    if (!m.ok || !m.fingerprint) continue;
    const r = await fetch(`${BASE}/internal/v1/mosaic.png?zone=${z.zoneId}&mode=${mode}`); if (!r.ok) continue;
    const fp = String(m.fingerprint).replace(/[^a-zA-Z0-9-]/g, "");
    const kb = await toWebp(page, Buffer.from(await r.arrayBuffer()), path.join(dir, `${z.zoneId}.${mode}.${fp}.webp`), 1600, 0.82);
    console.log(`  mosaics/${z.zoneId}.${mode}.${fp}.webp ${(kb / 1e3).toFixed(0)} KB`);
  }
  await page.close();
}

async function stills(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`${BASE}/healthz`);
  // continent thumbnails from the baked aerial mosaics
  const st = await (await fetch(`${BASE}/internal/v1/landing-stats`)).json();
  for (const z of st.zones.filter((z) => z.charted)) {
    const r = await fetch(`${BASE}/internal/v1/mosaic.png?zone=${z.zoneId}`);
    if (!r.ok) { console.log(`  ${z.zoneId}: no mosaic (${r.status})`); continue; }
    const kb = await toWebp(page, Buffer.from(await r.arrayBuffer()), path.join(MEDIA, "continents", `${z.zoneId}.webp`), 720, 0.8, true);
    console.log(`  continents/${z.zoneId}.webp ${(kb / 1e3).toFixed(0)} KB`);
  }
  if (process.argv.includes("--continents")) { await page.close(); return; }
  // tool screenshots for the "what this is" cards
  const shots = [
    ["tool-atlas.webp", `${BASE}/designer/world`, 3000, async (p) => { const f = await p.$(".atlas-frame"); return f ? f.screenshot() : null; }],
    ["tool-designer.webp", `${BASE}/designer?parcel=3050435`, 9000, null],
    ["tool-3d.webp", `${BASE}/designer/3d?parcel=3050435&showcase=1`, 6000, null],
  ];
  for (const [file, url, wait, custom] of shots) {
    const p = await browser.newPage({ viewport: { width: W, height: H } });
    // no welcome popup / landing bounce in the captures
    await p.addInitScript(() => { try { localStorage.setItem("efmaps-ftue", "1"); localStorage.setItem("ef_seen_landing", "1"); } catch {} });
    await p.goto(url, { waitUntil: "networkidle" }); await p.waitForTimeout(wait);
    const png = (custom && (await custom(p))) || (await p.screenshot());
    console.log(`  ${file} ${(await toWebp(page, png, path.join(MEDIA, file), 960, 0.8) / 1e3).toFixed(0)} KB`);
    await p.close();
  }
  // social share card 1200×630 (og:image): a clean caption-free engine frame on the right + brand + promise
  {
    const shot = await browser.newPage({ viewport: { width: 760, height: 630 } });
    await shot.goto(`${BASE}/designer/3d?parcel=1040345&showcase=1`, { waitUntil: "networkidle", timeout: 60000 });
    await shot.waitForFunction(() => window.__CF_SHOW && window.__CF_SHOW.ready, null, { timeout: 60000 });
    await shot.waitForTimeout(2500);
    await shot.evaluate(() => window.__CF_SHOW.setOrbit(2.6, 0.98, 230, 6));
    await shot.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const frame = await shot.screenshot({ type: "jpeg", quality: 90 });
    await shot.close();
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    const mark = fs.readFileSync(path.join(ROOT, "ui", "mark.svg"), "utf8");
    await og.setContent(`<html><body style="margin:0;width:1200px;height:630px;position:relative;overflow:hidden;background:#07060d;font-family:Inter,system-ui,sans-serif">
      <img src="data:image/jpeg;base64,${frame.toString("base64")}" style="position:absolute;right:0;top:0;width:760px;height:630px;object-fit:cover">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,#07060d 0%,#07060d 38%,rgba(7,6,13,.55) 58%,rgba(7,6,13,0) 78%)"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(600px 400px at 85% 50%,transparent 40%,rgba(7,6,13,.35) 100%)"></div>
      <div style="position:absolute;left:64px;top:60px;display:flex;gap:14px;align-items:center;color:#fff;font:700 22px/1 Georgia,serif;letter-spacing:.08em">
        <div style="width:48px;height:48px">${mark}</div>ETHER FANTASY · LAND</div>
      <div style="position:absolute;left:64px;top:180px;width:560px;color:#fff;font:700 58px/1.06 Georgia,serif">Own a piece of a world at war.</div>
      <div style="position:absolute;left:64px;top:340px;width:520px;color:#c9c3de;font:400 25px/1.4 Inter,system-ui,sans-serif">Every parcel is a real battlefield in Clash Front. Claim it, design it with AI, defend it.</div>
      <div style="position:absolute;left:64px;bottom:58px;color:#5fe9d0;font:600 20px/1 Inter,system-ui,sans-serif;letter-spacing:.14em">MAP.ETHERFANTASY.COM</div>
    </body></html>`);
    await og.waitForTimeout(300);
    await og.screenshot({ path: path.join(MEDIA, "og-card.png") });
    console.log(`  og-card.png ${(fs.statSync(path.join(MEDIA, "og-card.png")).size / 1e3).toFixed(0)} KB`);
    await og.close();
  }
  await page.close();
}

const browser = await pw.chromium.launch({ args: ARGS, ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}) });
try {
  if (process.argv.includes("--test")) await test(browser);
  if (process.argv.includes("--video")) await video(browser);
  if (process.argv.includes("--stills")) await stills(browser);
  if (process.argv.includes("--mosaics")) await liteMosaics(browser);
} finally { await browser.close(); }
