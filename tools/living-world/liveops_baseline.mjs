#!/usr/bin/env node
// D38 — evaluates every liveops-watch.json baseline against its committed report (tiny expression language: a JSON path,
// "a / b" with numeric literals, and max(<array path>.<field>)), then checks it sits in its healthy band.
import fs from "node:fs";
const W = JSON.parse(fs.readFileSync("data/living-world/liveops-watch.json", "utf8"));
const get = (o, p) => p.split(".").reduce((v, k) => { const m = k.match(/^(\w+)\[(\d+)\]$/); return m ? v[m[1]][+m[2]] : v[k]; }, o);
function evalExpr(obj, e) {
  e = e.trim(); const mx = e.match(/^max\((.+)\)$/);
  if (mx) { const [arr, ...rest] = mx[1].split("."); return Math.max(...get(obj, arr).flatMap((x) => (rest.join(".") === "totalCT" ? [x.LINKED, x.UNLINKED].filter((y) => !y.refused).map((y) => y.totalCT) : [get(x, rest.join("."))])).filter((v) => v != null)); }
  const parts = e.split(" / "); if (parts.length > 1) return parts.map((p) => (isNaN(+p) ? evalExpr(obj, p) : +p)).reduce((a, b) => a / b);
  return get(obj, e);
}
export function baselines() {
  return W.metrics.map((m) => { const v = evalExpr(JSON.parse(fs.readFileSync(m.baseline.file, "utf8")), m.baseline.expr), [lo, hi] = m.healthy;
    return { id: m.id, value: Math.round(v * 10000) / 10000, healthy: m.healthy, ok: (lo == null || v >= lo) && (hi == null || v <= hi) }; });
}
if (process.argv[1] && process.argv[1].endsWith("liveops_baseline.mjs")) { const b = baselines(); for (const x of b) console.log(`${x.ok ? "✓" : "✗"} ${x.id.padEnd(22)} ${x.value}  healthy ${JSON.stringify(x.healthy)}`); process.exit(b.every((x) => x.ok) ? 0 : 1); }
