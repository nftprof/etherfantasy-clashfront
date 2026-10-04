// D6f — the banded threat curve (doc 02 §7). Each ring has a threat range that lands its sim band (SKIRMISH 3–6 min,
// RAID 6–12 min; SIM-MATRIX); zone strength sets the ORDER inside the range (log scale, so UW3 ×5 is the top, not
// off the chart), the seeded jitter u ∈ [0,1) spreads parcels, and castle tier lifts in-castle POIs.
// Ranges live in poi-archetypes.json `threatBands` (tune there, never per map).
export function bandThreat(PA, ring, strength, u = 0.5, tier = null) {
  const B = PA.threatBands, b = B[ring], depth = Math.log(Math.max(1, strength || 1)) / Math.log(B.maxStrength);
  const f = tier != null ? B.castleMix.depth * depth + B.castleMix.tier * ((tier - 1) / 2) + B.castleMix.base
    : B.mix.depth * depth + B.mix.jitter * (u - 0.5) + B.mix.base;
  return Math.round(b.lo + (b.hi - b.lo) * Math.min(1, Math.max(0, f)));
}
