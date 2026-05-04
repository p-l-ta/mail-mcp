// Tiny stdio MCP client used by the smoke scripts.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "dist", "server.js");

export function startClient() {
  const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });
  let buf = "";
  const pending = new Map();

  child.stdout.on("data", (c) => {
    buf += c.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve, timer } = pending.get(msg.id);
          clearTimeout(timer);
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {}
    }
  });

  let nextId = 1;
  function send(method, params, timeoutMs = 60_000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  async function close() {
    for (const { timer } of pending.values()) clearTimeout(timer);
    pending.clear();
    child.kill();
    // small grace period for child to exit
    await new Promise((r) => setTimeout(r, 50));
  }

  return { child, send, notify, close };
}

export async function handshake(client, name = "smoke") {
  await client.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name, version: "0" },
  });
  client.notify("notifications/initialized", {});
}
