// Server-side PlayEscrow operator client. The game server is the OPERATOR_ROLE referee:
// it registers paid PvP matches, checks both teams staked, settles the winner, and credits
// single-player loot — all signed by the operator hot wallet.
//
// Config via env (set on the box):
//   PLAY_ESCROW   - deployed PlayEscrow proxy address
//   PC_RPC        - Pentagon Chain RPC (default https://rpc.pentagon.games)
//   OPERATOR_KEY  - operator private key, OR OPERATOR_KEYFILE pointing at a JSON {privateKey}
// If unconfigured, isEnabled() returns false and all calls throw — paid modes simply stay off.
import fs from "fs";
import { ethers } from "ethers";

const ABI = [
  "function entry() view returns(uint256)",
  "function allStaked(bytes32) view returns(bool)",
  "function createGame(bytes32 id, address[] a, address[] b)",
  "function settle(bytes32 id, uint8 winningTeam)",
  "function refund(bytes32 id)",
  "function creditLoot(address player, uint256 amount, bytes32 nonce)",
  "function creditFreeLoot(address player, uint256 amount, bytes32 nonce)",
  "function exec(address to, uint8 p, uint8 k) returns(uint256 amount, uint8 tier)",
  "function payEntry()",
  "function pvpPot() view returns(uint256)",
  "function spPool() view returns(uint256)",
  "function freePool() view returns(uint256)",
  "event EntryPaid(address indexed who, uint256 amount)",
  "event Reward(address indexed to, uint256 amount, uint8 tier, bool free)",
];

let _c = null, _wallet = null, _addr = null;

function loadKey() {
  if (process.env.OPERATOR_KEY) return process.env.OPERATOR_KEY.trim();
  const f = process.env.OPERATOR_KEYFILE || `${process.env.HOME || ""}/.ef_operator_key.json`;
  try { return JSON.parse(fs.readFileSync(f, "utf8")).privateKey; } catch { return null; }
}

function contract() {
  if (_c) return _c;
  const addr = process.env.PLAY_ESCROW;
  const key = loadKey();
  if (!addr || !key) return null;
  const provider = new ethers.JsonRpcProvider(process.env.PC_RPC || "https://rpc.pentagon.games");
  _wallet = new ethers.Wallet(key, provider);
  _addr = addr;
  _c = new ethers.Contract(addr, ABI, _wallet);
  return _c;
}

export const isEnabled = () => !!contract();
export const operatorAddress = () => { contract(); return _wallet ? _wallet.address : null; };
export const escrowAddress = () => { contract(); return _addr; };

// bytes32 match id from any string (e.g., the lobby party/room code)
export const matchId = (s) => ethers.id(String(s));

function need() { const c = contract(); if (!c) throw new Error("PlayEscrow not configured (PLAY_ESCROW / OPERATOR_KEY)"); return c; }

export async function createGame(id, teamA, teamB) { const t = await need().createGame(id, teamA, teamB); return (await t.wait()).hash; }
export async function bothStaked(id) { return await need().allStaked(id); }
export async function settle(id, winningTeam) { const t = await need().settle(id, winningTeam); return (await t.wait()).hash; }
export async function refund(id) { const t = await need().refund(id); return (await t.wait()).hash; }
export async function creditLoot(player, amountCT, nonce) {
  const amt = typeof amountCT === "bigint" ? amountCT : ethers.parseEther(String(amountCT));
  const n = typeof nonce === "string" && nonce.startsWith("0x") ? nonce : ethers.id(String(nonce));
  const t = await need().creditLoot(player, amt, n); return (await t.wait()).hash;
}
// VIP free-play win → paid from the house-funded freePool (separate from the paid spPool).
export async function creditFreeLoot(player, amountCT, nonce) {
  const amt = typeof amountCT === "bigint" ? amountCT : ethers.parseEther(String(amountCT));
  const n = typeof nonce === "string" && nonce.startsWith("0x") ? nonce : ethers.id(String(nonce));
  const t = await need().creditFreeLoot(player, amt, n); return (await t.wait()).hash;
}
// v3 payout: the CONTRACT decides the amount. p: free? 1:0 (pool), k: floor? 1:0 (outcome).
// Reads the rolled amount + tier back from the Reward event. Falls back to v2 credit* if the
// proxy isn't on v3 yet (zero-downtime during the upgrade).
export async function award(player, free, floor, rollAmtFallback, nonce) {
  const c = need();
  try {
    const t = await c.exec(player, free ? 1 : 0, floor ? 1 : 0);
    const r = await t.wait();
    let amount = null, tier = 0;
    for (const log of r.logs) { try { const d = c.interface.parseLog(log); if (d && d.name === "Reward") { amount = Number(ethers.formatEther(d.args.amount)); tier = Number(d.args.tier); break; } } catch {} }
    return { tx: r.hash, amount, tier };
  } catch (e) {
    if (rollAmtFallback == null) throw e;                       // no v2 fallback requested → bubble up
    const amt = ethers.parseEther(String(rollAmtFallback));
    const n = typeof nonce === "string" && nonce.startsWith("0x") ? nonce : ethers.id(String(nonce || ("loot-" + Date.now())));
    const t = await (free ? c.creditFreeLoot(player, amt, n) : c.creditLoot(player, amt, n));
    return { tx: (await t.wait()).hash, amount: rollAmtFallback, tier: 0, fallback: true };
  }
}
export async function pools() { const c = need(); return { pvpPot: await c.pvpPot(), spPool: await c.spPool() }; }

// verify a single-player payEntry tx: confirmed, to=escrow, from=wallet, emitted EntryPaid(wallet)
export async function verifyEntryPaid(txHash, wallet) {
  need();
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return false;
  const r = await _wallet.provider.getTransactionReceipt(txHash);
  if (!r || r.status !== 1) return false;
  if (!r.to || r.to.toLowerCase() !== _addr.toLowerCase()) return false;
  if (!r.from || r.from.toLowerCase() !== String(wallet).toLowerCase()) return false;
  const iface = new ethers.Interface(ABI);
  for (const log of r.logs) {
    try { const p = iface.parseLog(log); if (p && p.name === "EntryPaid" && p.args.who.toLowerCase() === String(wallet).toLowerCase()) return true; } catch {}
  }
  return false;
}
