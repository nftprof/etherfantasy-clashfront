# EtherFantasy MOBA — Multiplayer Setup (READ ME)

## TL;DR — what do I need to run?

**Just `start_game.bat`. That's it.**

- `start_game.bat` → runs the game server (serve.py) on port **8000**. Required, always.
- `start_peer_server.bat` → **OPTIONAL**. Only needed if you want matchmaking to work
  with NO internet at all (pure LAN). If you skip it, the game automatically uses the
  free PeerJS cloud for matchmaking — the actual gameplay traffic is still
  peer-to-peer between the computers either way.

## What IP do my friends use?

1. Start `start_game.bat` and open http://localhost:8000/ yourself.
2. Click **🌐 Host Room** and pick a champion — the lobby opens and shows
   **"Friends on your network play at: http://192.168.x.x:8000/"** (it auto-detects
   your LAN IP).
3. Friends on the same Wi-Fi/network open that address in THEIR browser (any modern
   Chrome/Edge/Firefox), click **🔗 Join Room**, type your 4-letter room code, pick a
   champion — they appear in your lobby. Press **START** whenever.

If you ever need the IP manually: open Command Prompt → `ipconfig` → use the
"IPv4 Address" of your active adapter (e.g. `192.168.1.23` → friends browse to
`http://192.168.1.23:8000/`).

## First time only: Windows Firewall

The first time you run `start_game.bat`, Windows may ask to allow Python through the
firewall — click **Allow** (check "Private networks"). If friends can't reach your
IP, this is almost always the reason: allow **port 8000** (and **9000** if you use the
local peer server) for Python on private networks.

## The three play modes (on champion select)

| Button | What it does |
|---|---|
| ⚡ **Quick Match** | Auto-joins ANY open game (a waiting lobby or a running game with a free seat). Nothing found → hosts a game that starts vs the AI in 25s; players can still drop in mid-game. |
| 🌐 **Host Room** | Creates a private room with a 4-letter code. Lobby shows both team rosters; you press START. |
| 🔗 **Join Room** | Enter the host's code. Pick your side first: 🤝 Co-op (host's team, AI keeps the enemy hero) / ⚔ Versus / 🎲 Any. You can also switch sides in the lobby. |

Up to **2v2** (4 heroes). Joining mid-game is allowed — you take over the AI hero with
your own champion, or spawn as a 3rd/4th hero. If someone disconnects, the AI takes
their hero back over.

🏆 **Tournament stakes (optional):** the host can set the room to Tournament — everyone
pays 1 💎CT to compete; winners get their entry back + 50% of the losers'/forfeited
fees. Earn CT in the PVE mode (pve.html).

## Internet (not same network) play

The room system works over the internet too IF friends can reach your PC:
the simplest way is a VPN-LAN tool like Tailscale/Hamachi/ZeroTier (everyone joins,
then use your VPN IP exactly like a LAN IP). Port-forwarding 8000 on your router also
works but is more fiddly.

## Troubleshooting

- **"Room not found"** → host must be sitting in the lobby (or in-game) with the code
  active; codes die when the host closes the tab. Both sides need internet unless the
  local peer server is running.
- **Friends see the page but joining hangs** → matchmaking can't reach the PeerJS
  cloud (no internet?). Run `start_peer_server.bat` on the host PC (needs Node.js,
  first run downloads the package), then everyone F5 — the game auto-detects it
  ("Using LOCAL PeerJS server :9000" in F12 console).
- **Page won't load at your IP** → firewall (see above), or you're on different
  networks (guest Wi-Fi is often isolated).
- **Lag** → the host PC runs the whole simulation; use the strongest PC as host.
