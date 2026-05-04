#!/usr/bin/env node
import { startClient, handshake } from "./_client.mjs";

const account = process.argv[2] ?? "iCloud";
const mailbox = process.argv[3] ?? "INBOX";
const limit = Number(process.argv[4] ?? 10);
const unreadOnly = process.argv.includes("--unread");

const client = startClient();
let exitCode = 0;
try {
  await handshake(client, "smoke-list-recent");
  console.log(
    `Calling list_recent { account: "${account}", mailbox: "${mailbox}", limit: ${limit}, unread_only: ${unreadOnly} }...\n`,
  );
  const t0 = Date.now();
  const res = await client.send(
    "tools/call",
    {
      name: "list_recent",
      arguments: { account, mailbox, limit, unread_only: unreadOnly },
    },
    120_000,
  );
  const dt = Date.now() - t0;

  if (res.error) {
    console.error("RPC error:", res.error);
    exitCode = 1;
  } else {
    const text = res.result?.content?.[0]?.text ?? "";
    if (res.result?.isError) {
      console.error(`Tool isError after ${dt}ms:\n${text}`);
      exitCode = 1;
    } else {
      const items = JSON.parse(text);
      console.log(`Got ${items.length} items in ${dt}ms:\n`);
      for (const i of items) {
        const subj = (i.subject || "(no subject)").slice(0, 70);
        const from = (i.from || "?").slice(0, 50);
        console.log(`  • ${i.unread ? "UNREAD " : "       "}[${i.date}] ${subj}`);
        console.log(`      from: ${from}`);
        console.log(`      id:   ${i.messageId}`);
      }
    }
  }
} catch (e) {
  console.error("smoke-list-recent failed:", e.message);
  exitCode = 1;
} finally {
  await client.close();
  process.exit(exitCode);
}
