#!/usr/bin/env node
import { startClient, handshake } from "./_client.mjs";

const query = process.argv[2] ?? "receipt";
const limit = Number(process.argv[3] ?? 5);

const client = startClient();
let exitCode = 0;
try {
  await handshake(client, "smoke-search");
  console.log(`Searching for "${query}" (limit ${limit})...\n`);
  const t0 = Date.now();
  const res = await client.send("tools/call", {
    name: "search_emails",
    arguments: { query, limit },
  });
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
      const hits = JSON.parse(text);
      console.log(`Got ${hits.length} hits in ${dt}ms:\n`);
      for (const h of hits) {
        const subj = (h.subject || "(no subject)").slice(0, 70);
        const from = h.fromName || h.fromAddress || "(no from)";
        const flags = [
          !h.read ? "UNREAD" : "",
          h.flagged ? "★" : "",
          h.deleted ? "DEL" : "",
        ].filter(Boolean).join(" ");
        console.log(`  • [${h.dateReceived?.slice(0, 10) ?? "?"}] ${subj} ${flags ? "(" + flags + ")" : ""}`);
        console.log(`      from:    ${from}`);
        console.log(`      mbox:    ${h.mailboxName ?? "?"}`);
        console.log(`      msg-id:  ${h.messageId ?? "(none)"}`);
        if (h.snippet) console.log(`      snippet: ${h.snippet.slice(0, 80)}`);
      }
    }
  }
} catch (e) {
  console.error("smoke-search failed:", e.message);
  exitCode = 1;
} finally {
  await client.close();
  process.exit(exitCode);
}
