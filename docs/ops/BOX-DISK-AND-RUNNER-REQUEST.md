# Request to the AWS server admin — grow the cf box disk + harden the Actions runner

> **From:** the Clash Front map/deploy pipeline (CF ParcelMap Design Agent, on behalf of the product owner) ·
> **Date:** 2026-10-29 · **Host:** the Singapore box that serves `cf.etherfantasy.com`, `map.etherfantasy.com`
> and the MOBA lobby — EC2 instance `ip-172-31-25-128` (public 13.250.39.41), user `ubuntu`, root volume
> mounted at `/` (`/dev/root`, **29 GB**). Launch-plan item **M6** (`docs/briefs/SHORTEST-PATH-TO-PLAY.md`).

## 1. What we need

| # | Change | Size / value | Why |
|---|---|---|---|
| 1 | **Grow the root EBS volume** from 29 GB to **80 GB** (minimum 60 GB) | +51 GB | the battle-map registry `~/ef-battlefields` holds the pre-baked default maps for every land parcel. Two of ten continents (BUS + EDU, 84k maps) + all 4,518 estate maps already use **12 GB**; the full world is **≈25 GB** (284k parcels). The disk is at **1.4 GB free** today — baking has stopped. 16 GB of the volume is other box content (services, node_modules, logs). |
| 2 | **Add 4 GB of swap** | 4 GB swapfile | on 2026-10-26 a bake process pushed the box out of RAM; the kernel OOM-killer took the process **and** the GitHub Actions runner with it, which stayed down for 33 hours and blocked every deploy. The job itself is fixed (memory is ~¼ now), swap is the safety net. |
| 3 | **Make the runner self-healing**: `Restart=always` on the runner's systemd unit | — | the runner (`~/actions-runner-cf`, service `actions.runner.*`) did not restart after the OOM kill. Every deploy and bake of both CF and the map service goes through it. |

Nothing else changes: no new ports, no new services, no instance type change required (the bakes are single-core and run in minutes once the disk exists).

## 2. Steps (grow the volume)

1. **AWS console → EC2 → Volumes** → select the instance's root volume → **Modify volume** → size **80 GiB** (gp3 is fine; keep IOPS/throughput defaults). Modification is online; no stop needed.
2. On the instance, once the volume state shows *optimizing/completed*:
   ```bash
   lsblk                              # find the root disk + partition (e.g. nvme0n1 / nvme0n1p1, or xvda / xvda1)
   sudo growpart /dev/nvme0n1 1       # grow the partition (adjust disk + partition number from lsblk)
   sudo resize2fs /dev/root           # ext4 → grow the filesystem (xfs: sudo xfs_growfs /)
   df -h /                            # expect ~80G size
   ```
3. Tell us when `df -h /` shows the new size; the map pipeline then resumes (`map-bake.yml`, zones UW1 → HUB → ENT → UW2 → sky).

## 3. Steps (swap + runner)

```bash
# 4 GB swap
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h

# runner: restart on failure
UNIT=$(systemctl list-units --type=service --all 'actions.runner.*' --no-legend | awk '{print $1}' | head -1)
sudo mkdir -p /etc/systemd/system/$UNIT.d
printf '[Service]\nRestart=always\nRestartSec=10\n' | sudo tee /etc/systemd/system/$UNIT.d/restart.conf
sudo systemctl daemon-reload && sudo systemctl restart $UNIT && systemctl status $UNIT --no-pager | head -5
```

## 4. Sizing rationale (so the number is not arbitrary)

| Content | Size |
|---|---:|
| Registry today (BUS + EDU + all estates, 102k rows) | 12 GB |
| Remaining 8 zones (UW1 2.6 · HUB 5.3 · ENT 3.4 · UW2 2.7 · HS1/HS2/HS3/UW3 ≈ 4) | ≈ 18 GB |
| Other box content (services, deps, logs) | 16 GB |
| Headroom for re-bakes / new versions (old versions stay on disk) + growth | ≈ 30 GB |
| **Total** | **≈ 76 GB → 80 GB** |

Related: the orphaned rows of the first (July) bake are being purged by the pipeline (≈1.3 GB back); render manifests
stay lazy. Monitoring note for later (M6): a `df` watch on `~/ef-battlefields` and a `curl /api/world` uptime check.
