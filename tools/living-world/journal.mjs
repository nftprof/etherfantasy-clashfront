// D26 — the personal journal (doc 06 §7 watch item): EVERY fight a player takes becomes a private line, wins and
// losses alike ("losing is a story", doc 06 §5). The region feed (D10) stays curated; the journal is where a routine
// clear still reads like something happened. `fresh` = a first clear today, any event, or any loss; a repeat clear
// is logged honestly with its anti-farm multiplier but isn't fresh. Pure; no randomness.
import { t, has, ordinal } from "./i18n.mjs";   // D45: all copy lives in data/living-world/i18n/<lang>.json
export function where(at, home, lang = "en") {
  if (!at || !home) return t("where.region", {}, lang);
  const dx = at[0] - home[0], dz = at[1] - home[1], d = Math.round(Math.hypot(dx, dz));
  return d < 5 ? t("where.gates", {}, lang) : t("where.dist", { d, dir: t(`dir.${((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8}`, {}, lang) }, lang);
}
export function journalEntry({ kind, k, won, nth = 1, mult = 1, reward = 0, planted = false, at = null, home = null, lang = "en" }) {
  const w = where(at, home, lang), poi = t(has(`poi.${k}`, lang) ? `poi.${k}` : "poi._default", {}, lang);
  if (!won) return { fresh: true, text: kind === "POI_CLEARED" ? t("journal.loss.poi", { poi, where: w }, lang) : t("journal.loss.event", { target: t(`journal.lossTarget.${kind}`, {}, lang), where: w }, lang) };
  let text = t(`journal.win.${kind}`, { poi, where: w }, lang);
  if (nth > 1) return { fresh: false, text: t("journal.repeat", { text, nth: ordinal[lang](nth), mult, reward }, lang) };
  if (planted) text = t("journal.planted", { text }, lang);
  return { fresh: true, text: t("journal.fresh", { text, reward }, lang) };
}
