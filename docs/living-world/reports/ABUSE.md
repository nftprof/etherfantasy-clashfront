# Abuse sim: can a coalition farm the world?

`tools/living-world/abuse_sim.mjs`. A main account and its alt try to farm each payout through the real resolver and market code. The **coalition's** net CT is summed across both accounts per attempt; the alt's token self-fight still loses units (60 infantry + 10 siege, at canon re-training cost).

| Scheme | Linked alt (same alliance or shared ledger history) | Unlinked alt (invisible to the relation check) |
|---|---|---|
| Guardian bounty self-farm (alt KOs your Warden) | -1.5 CT − 2.2 CT of units = **-3.7 CT** | -0.75 CT − 2.2 CT of units = **-2.95 CT** |
| Defence spoils self-farm (alt breaks your fully staked castle) | -9.07 CT − 2.2 CT of units = **-11.27 CT** | -5.45 CT − 2.2 CT of units = **-7.65 CT** |
| SIEGE_ME dare self-farm (alt takes your dare pot) | -3 CT − 2.2 CT of units = **-5.2 CT** | -0.3 CT − 2.2 CT of units = **-2.5 CT** |
| BOUNTY laundering (bounty on your own alt) | refused (RELATED_TARGET (can't post)) | -0.4 CT − 2.2 CT of units = **-2.6 CT** |
| SPONSORED_AIRDROP self-farm (alt grabs your crate) | -7.5 CT − 2.2 CT of units = **-9.7 CT** | -0.75 CT − 2.2 CT of units = **-2.95 CT** |
| MERC_BIDDING shill (bid up your own company) | -1.2 CT = **-1.2 CT** | -1.2 CT = **-1.2 CT** |

**Every scheme is net-negative** (worst case: 0 CT per attempt).
- A linked alt loses everything: the relation check burns the share, or refuses the post.
- An unlinked alt still pays the split's burn and pool share, or the ≥ 10 % pot rake, plus the units it throws away.
- Shill bidding only raises what the coalition pays an NPC company.

There's no farm loop: the world never pays a coalition to fight itself.
