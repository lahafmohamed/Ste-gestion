// Lanceur dev (appelé par dev.bat) : choisit des ports libres pour l'API et le
// web, démarre `pnpm dev`, puis ouvre le navigateur quand les deux répondent.
//
// Un ancien `pnpm dev` resté en arrière-plan tient 3001 : relancer échouait en
// EADDRINUSE. Ici on prend le port suivant au lieu d'échouer.
//
// Usage : node scripts/dev.mjs [--no-open]
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_DEFAULT = 3001;
const WEB_DEFAULT = 5273;
const noOpen = process.argv.includes("--no-open");

function canListen(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    // Machine sans IPv6 : l'adresse `::` n'existe pas, ce n'est pas un port pris.
    srv.once("error", (err) => resolve(err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL"));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

// L'API écoute en IPv4 (0.0.0.0), Vite en IPv6 double pile (::) : un port n'est
// libre que si les deux le sont.
async function isFree(port) {
  return (await canListen(port, "0.0.0.0")) && (await canListen(port, "::"));
}

async function nextFree(start) {
  for (let port = start; port < start + 50; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`Aucun port libre entre ${start} et ${start + 49}`);
}

async function responds(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

const apiPort = await nextFree(API_DEFAULT);
const webPort = await nextFree(WEB_DEFAULT);
const webUrl = `http://localhost:${webPort}`;

const note = (port, def) => (port === def ? "" : ` (${def} occupé)`);
console.log(`[dev] API  http://localhost:${apiPort}${note(apiPort, API_DEFAULT)}`);
console.log(`[dev] Web  ${webUrl}${note(webPort, WEB_DEFAULT)}`);

// PORT est lu par l'API (prioritaire sur apps/api/.env : dotenv n'écrase pas une
// variable déjà définie) ; API_PORT et WEB_PORT par apps/web/vite.config.ts.
const child = spawn("pnpm dev", {
  cwd: ROOT,
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(apiPort),
    API_PORT: String(apiPort),
    WEB_PORT: String(webPort),
  },
});

let stopped = false;
child.on("exit", (code) => {
  stopped = true;
  process.exit(code ?? 0);
});
// Ctrl+C atteint aussi pnpm : on le laisse s'arrêter, puis on sort avec lui.
process.on("SIGINT", () => {});

if (!noOpen) {
  const deadline = Date.now() + 60_000;
  while (!stopped && Date.now() < deadline) {
    const [api, web] = await Promise.all([
      responds(`http://127.0.0.1:${apiPort}/health`),
      responds(`http://127.0.0.1:${webPort}/`),
    ]);
    if (api && web) {
      spawn("cmd", ["/c", "start", "", webUrl], { stdio: "ignore", detached: true }).unref();
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
