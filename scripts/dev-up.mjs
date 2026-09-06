#!/usr/bin/env node
/**
 * Start ALONG on :8080 if it is not already serving.
 *   node scripts/dev-up.mjs        → check, then npm run dev if down
 *   node scripts/dev-up.mjs stop   → stop whatever is bound to 8080
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";

const PORT = 8080;
const HOST = "127.0.0.1";

function listening() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: HOST, port: PORT }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(800, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function stop() {
  if (!(await listening())) {
    console.log(`[along] :${PORT} is already down`);
    return;
  }
  const cmd =
    process.platform === "win32"
      ? spawn("powershell", ["-Command", `Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`], {
          stdio: "inherit",
        })
      : spawn("sh", ["-c", `pids=$(lsof -ti tcp:${PORT} 2>/dev/null); [ -n "$pids" ] && kill $pids`], {
          stdio: "inherit",
        });
  await new Promise((res) => cmd.on("exit", res));
  console.log(`[along] stopped :${PORT}`);
}

async function start() {
  if (await listening()) {
    console.log(`[along] already up  http://${HOST}:${PORT}/`);
    return;
  }
  console.log(`[along] :${PORT} is down — starting`);
  const child = spawn("npm", ["run", "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

const arg = process.argv[2];
if (arg === "stop") await stop();
else await start();
