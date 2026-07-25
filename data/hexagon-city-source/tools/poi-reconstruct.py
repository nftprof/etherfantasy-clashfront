#!/usr/bin/env python3
"""
Reconstruct POI locations (recipe B in ../POI-MODEL.md) from estate->POI membership.

For each POI, computes the centroid + covering radius of its member estates' centers
(taken from parcels-l2.json), producing poi.json in the SAME coordinate space as the
parcels snapshot. Optionally stamps each estate (and its L3 children) with its `poi` list.

Usage:
  python poi-reconstruct.py --membership membership.json \
      --parcels ../parcels-l2.json --out ../poi.json [--stamp]

membership.json format:  { "<estateTokenId>": ["Ferry Port", "Airport"], ... }
  (estate tokenId = the 7-digit L2 id used in parcels-l2.json, e.g. "3001180")

Notes:
- centers are per-zone SVG-space (parcels-l2.json `center`). If you need one global space,
  transform centers with zone-layout.json worldOffset FIRST, then run this. POIs that span
  multiple zones require the global space to be meaningful.
- radius = max distance from centroid to any member (covers all members). Also emits p90
  radius (robust to outliers) and member count.
"""
import json, argparse, math, statistics, os

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--membership", required=True)
    ap.add_argument("--parcels", default=os.path.join(os.path.dirname(__file__), "..", "parcels-l2.json"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "poi.json"))
    ap.add_argument("--stamp", action="store_true", help="write poi list back onto parcels-l2.json estates")
    a = ap.parse_args()

    membership = json.load(open(a.membership, encoding="utf-8"))
    pf = json.load(open(a.parcels, encoding="utf-8"))
    by_id = {p["tokenId"]: p for p in pf["parcels"]}

    # gather member centers per POI
    poi_members = {}
    missing = []
    for tok, pois in membership.items():
        p = by_id.get(str(tok))
        if not p:
            missing.append(tok); continue
        for name in pois:
            poi_members.setdefault(name, []).append(p)

    pois_out = []
    for name, members in sorted(poi_members.items()):
        cs = [m["center"] for m in members if m.get("center")]
        cx = statistics.mean(c[0] for c in cs)
        cy = statistics.mean(c[1] for c in cs)
        dists = sorted(math.dist((cx, cy), c) for c in cs)
        radius = dists[-1] if dists else 0.0
        p90 = dists[int(0.9 * (len(dists) - 1))] if dists else 0.0
        zones = sorted({m["zone"] for m in members})
        pois_out.append({
            "name": name,
            "center": [round(cx, 3), round(cy, 3)],
            "radius": round(radius, 3),
            "radiusP90": round(p90, 3),
            "memberEstateCount": len(members),
            "zones": zones,
            "memberEstateTokenIds": [m["tokenId"] for m in members],
        })

    out = {
        "source": {"kind": "reconstructed POI (recipe B: centroid of member estates)",
                   "coordinateSpace": "parcels-l2.json per-zone SVG space (transform with zone-layout worldOffset for global)",
                   "note": "Approximate: centroid/covering-radius of member estates, NOT the original POI.json circle. "
                           "For exact circles use recipe A (POI.json + L2Center.json)."},
        "poiCount": len(pois_out),
        "unmatchedEstateTokenIds": missing,
        "poi": pois_out,
    }
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"wrote {a.out}: {len(pois_out)} POIs, {len(missing)} membership ids unmatched")
    for p in pois_out:
        print(f"  {p['name']:22} center={p['center']} r={p['radius']} (p90 {p['radiusP90']}) "
              f"estates={p['memberEstateCount']} zones={p['zones']}")

    if a.stamp:
        # index membership onto estates, and prepare parent->pois for L3 inheritance
        for tok, p in by_id.items():
            pl = membership.get(tok)
            if pl: p["poi"] = pl
        json.dump(pf, open(a.parcels, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"stamped poi[] onto {sum(1 for p in pf['parcels'] if p.get('poi'))} estates in {a.parcels}")

if __name__ == "__main__":
    main()
