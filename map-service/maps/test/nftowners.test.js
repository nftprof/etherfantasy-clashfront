// nftowners.test.js — the NFT-data ownership client (owner 2026-07-21). Mock fetch: the sandbox
// blocks nft-data.pentagon.games; the box reaches it. Verifies tokenId===parcelId mapping,
// pagination, wallet validation, and the walletOwnsParcel edit-gate primitive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { landOfWallet, walletOwnsParcel, PARCELS_CONTRACT, ESTATE_CONTRACT, _clearCache } from "../nftowners.js";

const WALLET = "0x4bb9000000000000000000000000000000000c4a2".slice(0, 42);
const goodWallet = "0x4bb90000000000000000000000000000000000a2";

// a fetch that serves two pages for the parcels contract, one for estate
function mockFetch(pages) {
  return async (url) => {
    const m = /collection\/(0x[0-9a-f]+)\/items\?owner=([^&]+)&page=(\d+)/.exec(url);
    if (!m) return { ok: false };
    const [, contract, , page] = m;
    const key = contract.toLowerCase() + ":" + page;
    const items = pages[key] || [];
    return { ok: true, json: async () => ({ items }) };
  };
}

test("tokenId === parcelId: a wallet's parcels come back as parcelIds", async () => {
  _clearCache();
  const p = PARCELS_CONTRACT(), e = ESTATE_CONTRACT();
  const f = mockFetch({
    [p + ":1"]: Array.from({ length: 100 }, (_, i) => ({ tokenId: "6020000" + String(i).padStart(4, "0"), owner: goodWallet })),
    [p + ":2"]: [{ tokenId: "60200019999", owner: goodWallet }],
    [e + ":1"]: [{ tokenId: "1020371", owner: goodWallet, name: "Grand Academy Estate" }],
  });
  const land = await landOfWallet(goodWallet, f);
  assert.equal(land.parcels.size, 101, "paginated: 100 + 1");
  assert.ok(land.parcels.has("60200019999"), "second page merged");
  assert.equal(land.estates.length, 1);
  assert.equal(land.estates[0].name, "Grand Academy Estate");
});

test("walletOwnsParcel is the edit-gate primitive", async () => {
  _clearCache();
  const p = PARCELS_CONTRACT();
  const f = mockFetch({ [p + ":1"]: [{ tokenId: "60203670103", owner: goodWallet }] });
  assert.equal(await walletOwnsParcel(goodWallet, "60203670103", f), true);
  assert.equal(await walletOwnsParcel(goodWallet, "99999999999", f), false);
});

test("invalid wallet → empty, never throws", async () => {
  _clearCache();
  const land = await landOfWallet("not-a-wallet", mockFetch({}));
  assert.equal(land.parcels.size, 0);
  assert.equal(land.invalid, true);
  assert.equal(await walletOwnsParcel("0xbad", "1", mockFetch({})), false);
});

test("contracts default to the confirmed PG collections", () => {
  assert.equal(PARCELS_CONTRACT(), "0x383fb8793294d82b3c20bf04c10f4b9b9cb2aca7");
  assert.equal(ESTATE_CONTRACT(), "0x28cd2990f34db387d011d7cc693a2bcedd8dc654");
});

console.log("nftowners tests defined");
