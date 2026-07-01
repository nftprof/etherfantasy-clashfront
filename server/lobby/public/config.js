/* EF Moba lobby — deploy-time front-end config.
   Edit these on the box (or templatize in CI). All are optional; sensible
   defaults are used when left blank. */
window.EF_PG_LOGIN_URL = "";
//   ^ Pentagon Games hosted-login URL. We append `?return_to=<this page>` and
//     expect to come back with `?token=<access_token>` (or `#access_token=`).
//     Confirm the exact URL + return-param name against pg-identity-docs and set
//     it here. While blank, players can use the Dev login (server must run with
//     PG_DEV_FALLBACK=1) — turn that OFF in production.

window.EF_LOBBY_WS = "";
//   ^ Lobby WebSocket URL. Blank = same origin (wss://moba.etherfantasy.com),
//     which is what the nginx config below proxies to the lobby service. Only set
//     this if the lobby lives on a different host/path.

window.EF_GAME_CLIENT = "/play/index.html";
//   ^ Where the actual game client is served (the EF Moba index.html). The lobby
//     redirects here on launch with ?net=server&ws=<gameWs>&party=…&team=…&slot=…

window.EF_REGIONS = [
  { id: "ca", name: "Canada · Montreal", host: "ca.moba.etherfantasy.com" },
  { id: "sg", name: "Asia · Singapore",  host: "sg.moba.etherfantasy.com" },
];
//   ^ Regional game servers. The landing pings each (GET https://<host>/ping),
//     auto-selects the lowest, colour-codes it, and makes the player confirm a
//     high-ping region before joining. Connecting to a region routes the lobby +
//     match to that box. If none are reachable yet, it falls back to this origin.
