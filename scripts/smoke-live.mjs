#!/usr/bin/env node
import { startClient, handshake } from "./_client.mjs";

const client = startClient();
let exitCode = 0;
try {
  await handshake(client, "smoke-live");
  console.log("Calling list_accounts_and_mailboxes...\n");
  const res = await client.send("tools/call", {
    name: "list_accounts_and_mailboxes",
    arguments: {},
  });
  if (res.error) {
    console.error("RPC error:", res.error);
    exitCode = 1;
  } else {
    const text = res.result?.content?.[0]?.text ?? "";
    if (res.result?.isError) {
      console.error("Tool isError:\n" + text);
      exitCode = 1;
    } else {
      const accounts = JSON.parse(text);
      console.log(`Got ${accounts.length} account(s):\n`);
      for (const a of accounts) {
        console.log(`  ${a.name} <${a.user}> — ${a.mailboxes.length} mailbox(es)`);
      }
    }
  }
} catch (e) {
  console.error("smoke-live failed:", e.message);
  exitCode = 1;
} finally {
  await client.close();
  process.exit(exitCode);
}
