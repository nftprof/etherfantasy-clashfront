// Central config — all via env so the same binary runs on LAN or AWS.
export const config = {
  PORT: parseInt(process.env.PORT || "8080", 10),
  TICK_HZ: parseInt(process.env.TICK_HZ || "30", 10),       // authoritative sim rate
  SNAPSHOT_HZ: parseInt(process.env.SNAPSHOT_HZ || "30", 10), // network broadcast rate (=tick → crispest; pairs with reconciliation + 80ms interp)
  TEAM_SIZE: parseInt(process.env.TEAM_SIZE || "1", 10),     // players per team to start a match (1 => 1v1; raise to 2 for 2v2)
  MAP: { min: -120, max: 120 },                              // square arena bounds
  MAX_MSG_PER_SEC: 40,                                       // per-connection input rate limit (anti-cheat)
  PICK_SEC: parseInt(process.env.PICK_SEC || "60", 10),     // champion-select countdown before a match goes live
  MATCH_GRACE_MS: parseInt(process.env.MATCH_GRACE_MS || "12000", 10), // form a party match with whoever's present after this, even if a seat never connects (failsafe; solo-vs-AI forms instantly via party size)
  EF_SERVER_URL: process.env.EF_SERVER_URL || null,         // informational; client uses its own
};
