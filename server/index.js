// EF Moba authoritative server — entry point.
// Starts an HTTP server (health + readiness) and attaches the WSS gateway.
// Same binary runs on a LAN box or AWS EC2 (SERVER_PLAN §8).
import http from "http";
import { attachGateway } from "./net/gateway.js";
import { config } from "./config.js";

let mm;
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ ok: true, service: "ef-moba-server", uptime: process.uptime(), ...(mm ? mm.stats() : {}) }));
    return;
  }
  res.writeHead(404); res.end();
});

mm = attachGateway(server);

server.listen(config.PORT, () => {
  console.log(`EF Moba server listening on :${config.PORT}  (tick ${config.TICK_HZ}Hz, snapshot ${config.SNAPSHOT_HZ}Hz, team size ${config.TEAM_SIZE})`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("uncaughtException", (e) => console.error("uncaught", e));
