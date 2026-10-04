// D6f — the banded threat curve (doc 02 §7). Each ring has a threat range that lands its sim band (SKIRMISH 3–6 min,
// RAID 6–12 min; SIM-MATRIX); zone strength sets the ORDER inside the range (log scale, so UW3 ×5 is the top, not
// off the chart), the seeded jitter u ∈ [0,1) spreads parcels, and castle tier lifts in-castle POIs.
// Ranges live in poi-archetypes.json `threatBands` (tune there, never per map). D14b: `groundShift` lowers the threat on
// defensible ground so a skirmish still lands its band with canon terrain modifiers on (the floor moves with it: the terrain makes up the difference).
export function bandThreat(PA, ring, strength, u = 0.5, tier = null, ground = null) {
  const B = PA.threatBands, b = B[ring], depth = Math.log(Math.max(1, strength || 1)) / Math.log(B.maxStrength);
  const f = tier != null ? B.castleMix.depth * depth + B.castleMix.tier * ((tier - 1) / 2) + B.castleMix.base
    : B.mix.depth * depth + B.mix.jitter * (u - 0.5) + B.mix.base;
  const shift = (ground && B.groundShift && B.groundShift[ground]) || 0;   // D14b: defensible ground (canon HILLS / RIVER ×1.10 defender) gets a lower threat
  return Math.max(b.lo + shift, Math.round(b.lo + (b.hi - b.lo) * Math.min(1, Math.max(0, f))) + shift);
}
