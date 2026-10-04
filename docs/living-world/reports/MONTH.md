# A month at scale: who holds the world?

`tools/living-world/month_sim.mjs`: 400 agents in 8 alliances (one whale playing every day with 3× the fights) over the real holdable-POI counts of 11 regions (23,489 POIs), 28 days. Outcomes are seeded PRNG (75 % vs wild, 45 % vs a rival), not the battle sim.

| Measure | Value |
|---|---|
| Fights | 25,274 (10,956 wild POIs taken, 4,715 taken from rivals) |
| POIs held at day 28 | 10,845 held, 12,644 still wild |
| Holdings Gini (0 = equal) | 0.296 |
| Top player / the whale | 170 / 170 POIs (1.57 % of all held) |
| Region banners changing hands over the month | 74 |
| Regions with a banner at day 28 | 8 / 11 |
| Most regions bannered by one player / one alliance | 1 / 2 |
| Players reaching each region unlock | POST_EVENTS 373, HARBOUR_RIGHTS 355, PAD_RIGHTS 326, FORM3_STATION 169 |
