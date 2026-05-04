#!/usr/bin/env node
import { startClient, handshake } from "./_client.mjs";

const client = startClient();
let exitCode = 0;
try {
  await handshake(client, "smoke");
  const list = await client.send("tools/list", {});
  const tools = list.result?.tools ?? [];
  console.log(`tools/list → ${tools.length} tools:`);
  for (const t of tools) console.log(`  • ${t.name}`);

  const expected = [
    "search_emails",
    "read_email",
    "list_accounts_and_mailboxes",
    "list_recent",
    "send_email",
    "reply_to_email",
    "set_message_flags",
  ];
  const names = tools.map((t) => t.name).sort();
  const missing = expected.filter((n) => !names.includes(n));
  if (missing.length) {
    console.error("\nMISSING TOOLS:", missing);
    exitCode = 1;
  } else {
    console.log("\n✓ all 7 tools registered");
  }
} catch (e) {
  console.error("smoke failed:", e.message);
  exitCode = 1;
} finally {
  await client.close();
  process.exit(exitCode);
}
