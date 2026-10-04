// D45 — the living-world string table. t(key, vars, lang) renders data/living-world/i18n/<lang>.json[key] with {name}
// placeholders; a missing key THROWS (the tests render every key), so copy can never silently go blank. Formatters that
// are grammar, not copy (English ordinals), live here per language.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/living-world/i18n");
const TABLES = {};
export const table = (lang = "en") => (TABLES[lang] ||= JSON.parse(fs.readFileSync(path.join(DIR, `${lang}.json`), "utf8")));
export function t(key, vars = {}, lang = "en") {
  const s = table(lang)[key]; if (typeof s !== "string") throw new Error(`i18n: missing key "${key}" (${lang})`);
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : "?"));
}
export const has = (key, lang = "en") => typeof table(lang)[key] === "string";
export const ordinal = { en: (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th") };
