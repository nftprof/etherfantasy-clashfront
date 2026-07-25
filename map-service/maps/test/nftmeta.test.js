// nftmeta.test.js — the NFT metadata override endpoints (owner 2026-07-21). Covers both the
// Polygon parcels collection (tokenId===parcelId, image=thumb) and the ETH estate collection.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mapsApi } from "../api.js";
import { PARCELS_CONTRACT, ESTATE_CONTRACT } from "../nftowners.js";

function once(req) {
  return new Promise((resolve) => {
    const srv = http.createServer((rq, rs) => { if (!mapsApi(rq, rs)) { rs.writeHead(404); rs.end(); } });
    srv.listen(0, () => {
      const { port } = srv.address();
      http.get({ port, path: req, headers: { host: "map.example" } }, (r) => {
        const chunks = []; r.on("data", (c) => chunks.push(c));
        r.on("end", () => { srv.close(); resolve({ status: r.statusCode, ctype: r.headers["content-type"], body: Buffer.concat(chunks) }); });
      });
    });
  });
}

test("parcel metadata: OpenSea shape, tokenId in name, image → this host's /image", async () => {
  const r = await once(`/nft/${PARCELS_CONTRACT()}/60200010000`);
  assert.equal(r.status, 200);
  assert.match(r.ctype, /application\/json/);
  const m = JSON.parse(r.body.toString());
  assert.match(m.name, /60200010000/);
  assert.equal(m.image, `https://map.example/nft/${PARCELS_CONTRACT()}/60200010000/image`);
  assert.ok(m.attributes.some((a) => a.trait_type === "Chain" && a.value === "Polygon"));
  assert.ok(m.attributes.some((a) => a.trait_type === "Type" && a.value === "Parcel"));
  assert.match(m.external_url, /designer\/3d\?parcel=60200010000/);
});

test("estate metadata: Ethereum chain", async () => {
  const r = await once(`/nft/${ESTATE_CONTRACT()}/999`);
  const m = JSON.parse(r.body.toString());
  assert.ok(m.attributes.some((a) => a.trait_type === "Chain" && a.value === "Ethereum"));
  assert.ok(m.attributes.some((a) => a.trait_type === "Type" && a.value === "Estate"));
});

test("image of an undesigned parcel → the EF logo placeholder PNG", async () => {
  const r = await once(`/nft/${PARCELS_CONTRACT()}/60200010000/image`);
  assert.equal(r.status, 200);
  assert.match(r.ctype, /image\/png/);
  assert.ok(r.body.length > 1000, "a real PNG (logo) came back");
});

console.log("nftmeta tests defined");
