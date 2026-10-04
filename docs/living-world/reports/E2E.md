# One fight, end to end, through the real kernel

`tools/living-world/e2e_slice.mjs`: board → allocate → headless battle (`server/sim`) → result callback → resolver → influence. Deterministic.

## ⚠ the Warden of Gullshoal Light stands for 10 h 48 m

1. **Board:** a live `GUARDIAN_CHALLENGE` with a bounty escrow of 0.5 CT.
2. **Allocate:** `battle_E2E00000000000000000000000` with 13 structures, the Warden, and deck GUARDIAN_WAKE.
3. **Battle (server/sim):** breached at 11:48. The Guardian woke at 9:22 and was KO'd at 11:09. Its damage share was 19.7 %. Attackers lost 81 units.
4. **Callback:** ATTACKER won; the Guardian outcome was **KO**; casualties INFANTRY 540, SIEGE 270.
5. **Resolved:** the castle's fate goes to the winner's PILLAGE / OCCUPY choice (canon post-victory flow); the raider gained 0.5 CT and the owner got 0 CT back; 0 CT is left in escrow. Feed: GUARDIAN_KO. Journal: “Cleared the Guardian's perch out in the region (+11)”.
6. **Influence:** the raider holds 0 in BUS, next unlock POST_EVENTS in 3.

## ⚠ the Ascendant of Fort Tidegate stands for 1 h 45 m: 8 min of power from first contact, 3 Ward Stones

1. **Board:** a live `GUARDIAN_CHALLENGE` with a bounty escrow of 4.5 CT.
2. **Allocate:** `battle_E2E00000000000000000000001` with 13 structures, the Ascendant, and deck GUARDIAN_WAKE.
3. **Battle (server/sim):** breached at 16:22. The Guardian woke at 9:09 and was KO'd at 15:23; Ward Stones fell at 9:08. Its damage share was 19.7 %. Attackers lost 87 units.
4. **Callback:** ATTACKER won; the Guardian outcome was **OUTLASTED**; casualties INFANTRY 580, SIEGE 290.
5. **Resolved:** the castle's fate goes to the winner's PILLAGE / OCCUPY choice (canon post-victory flow); the raider gained 2.25 CT and the owner got 2.25 CT back; 0 CT is left in escrow. Feed: GUARDIAN_OUTLASTED. Journal: “Cleared the Guardian's perch out in the region (+11)”.
6. **Influence:** the raider holds 0 in BUS, next unlock POST_EVENTS in 3.
