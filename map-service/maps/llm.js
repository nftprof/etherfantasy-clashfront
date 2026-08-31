// D6 owner-prompt LLM adapter — translates a free-text directive into GENERATOR PARAMETERS
// (never geometry; clampParams + the playability validator are the real authority downstream).
//
// Provider-agnostic by design (the user brings their own model, or we run our default):
//   MAPS_LLM_PROVIDER = openai-compat | anthropic          (unset ⇒ prompt mode 503s)
//   MAPS_LLM_URL      = chat-completions endpoint          (openai-compat: Venice, vLLM/Ollama,
//                       OpenRouter, Groq … and Pentagon's own POCA once it's hosted)
//   MAPS_LLM_KEY      = api key (or file ~/.ef_llm_key)
//   MAPS_LLM_MODEL    = model id
// The browser designer can ALSO do this translation client-side with the player's own key
// (card-app provider registry) and POST ready params — then this module is never called.
import fs from "fs";
import { PARAM_SPACE, clampParams } from "./schema.js";

// config precedence: env → ~/.ef_llm.json ({provider,url,model,key}) → defaults. The file form
// avoids the pm2 --update-env foot-gun (see REALTIME-NETCODE-HISTORY.md) — drop a JSON on the
// box, restart the lobby, done.
const fileCfg = () => { try { return JSON.parse(fs.readFileSync(`${process.env.HOME || ""}/.ef_llm.json`, "utf8")); } catch { return {}; } };
const cfg = () => {
  const f = fileCfg();
  return {
    provider: process.env.MAPS_LLM_PROVIDER || f.provider || "",
    url: process.env.MAPS_LLM_URL || f.url || "https://api.venice.ai/api/v1/chat/completions",
    key: process.env.MAPS_LLM_KEY || f.key ||
      (() => { try { return fs.readFileSync(`${process.env.HOME || ""}/.ef_llm_key`, "utf8").trim(); } catch { return ""; } })(),
    model: process.env.MAPS_LLM_MODEL || f.model || "llama-3.3-70b",
  };
};
export const llmEnabled = () => { const c = cfg(); return !!(c.provider && c.key); };

// one shared prompt (the browser designer embeds the same text) — schema-first, JSON-only.
// `budget` = the parcel's investment tier: the model is TOLD the hard caps (better designs than
// silent clamping), but clampParams(…, budget) enforces them regardless of what it replies.
export function directivePrompt(budget = null) {
  const lines = Object.entries(PARAM_SPACE).map(([k, s]) =>
    s.enum ? `  "${k}": one of ${JSON.stringify(s.enum)}` :
    s.int ? `  "${k}": integer ${s.int[0]}..${s.int[1]}` :
    s.num ? `  "${k}": number ${s.num[0]}..${s.num[1]}` : `  "${k}": boolean`);
  return "You translate a battlefield design directive into map-generator parameters for a war game. " +
    "Reply with ONLY a single JSON object (no prose, no code fences) with these fields:\n" + lines.join("\n") +
    "\nPick the archetype/palette/landmark that best matches the directive's theme and mood. " +
    "High density = cluttered tactical map; waterLevel matters for river/marsh archetypes; " +
    "volcanic palette renders water as lava; ember palette = dark military ground with ember-red CRYSTAL rocks (fire from gems, never lava)." +
    "\nOPTIONALLY add \"features\": [...] — up to 24 detail placements for precise composition. " +
    "Coords are normalized (-1..1, 0 = map center, +z = north); r/width are fractions of the map:\n" +
    '  {"kind":"riverBand","axis":"x"|"z","at":0.1-0.9,"width":0.02-0.3,"fords":1-3}  (axis "x" = river runs west-east across the map; "z" = runs south-north; "at" = where it sits, 0=south/west edge)\n' +
    '  {"kind":"ridge","x1":..,"z1":..,"x2":..,"z2":..,"passes":1-3} · {"kind":"road","x1","z1","x2","z2"}\n' +
    '  {"kind":"forestPatch"|"rockPatch"|"waterPool"|"clearing","x":..,"z":..,"r":..}\n' +
    '  {"kind":"landmarkAt","x","z"} · {"kind":"resourceAt","x","z","res":"GOLD_MINE"|"WOOD_GROVE"}\n' +
    '  {"kind":"mobCampAt","x","z"} · {"kind":"towerAt","x","z"}\n' +
    "Use features to realize specific composition — \"lava river splitting the map\" → a riverBand; " +
    "\"gold in the caldera\" → resourceAt at the crater. Explicit placements consume the same budget caps." +
    (budget ? `\nHARD BUDGET — this land's investment tier is "${budget.name}": resourceNodes ≤ ${budget.resourceNodes}, ` +
      `resourceRichness ≤ ${budget.maxRichness}, mobCamps ≤ ${budget.mobCamps}, towers ≤ ${budget.towers}` +
      (budget.landmark ? "" : ", landmark MUST be \"NONE\"") +
      ". Values above the budget are clamped — design the best map WITHIN it." : "");
}

const stripFences = (s) => String(s || "").replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes("```") ? "" : m)).replace(/```[\s\S]*$/, "").trim();
function parseParams(text, budget) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in LLM reply");
  return clampParams(JSON.parse(stripFences(m[0])), budget);
}

// directive → clamped params (within `budget`). `fetchFn` injectable for tests. One retry.
export async function translateDirective(directive, fetchFn = fetch, budget = null) {
  const c = cfg();
  if (!llmEnabled()) { const e = new Error("llm-unconfigured"); e.code = 503; throw e; }
  const ask = async (extra) => {
    const messages = [{ role: "system", content: directivePrompt(budget) }, { role: "user", content: String(directive).slice(0, 600) + (extra || "") }];
    let url = c.url, headers = { "content-type": "application/json" }, body;
    if (c.provider === "anthropic") {
      url = process.env.MAPS_LLM_URL || "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = c.key; headers["anthropic-version"] = "2023-06-01";
      body = { model: c.model, max_tokens: 900, system: messages[0].content, messages: [messages[1]] };
    } else {  // openai-compat (Venice, POCA, vLLM, OpenRouter, …)
      headers.authorization = "Bearer " + c.key;
      body = { model: c.model, max_tokens: 900, temperature: 0.4, messages };
    }
    const r = await fetchFn(url, { method: "POST", headers, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.error) throw new Error(typeof d.error === "string" ? d.error : d.error.message || "llm error");
    return c.provider === "anthropic" ? d.content?.[0]?.text : d.choices?.[0]?.message?.content;
  };
  try { return parseParams(await ask(), budget); }
  catch (e) { if (e.code === 503) throw e; return parseParams(await ask("\n\nReply with ONLY the JSON object."), budget); }
}
