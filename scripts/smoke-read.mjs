#!/usr/bin/env node
// Live smoke for read_email: search for a query, pick the first hit with a
// non-null message-id, then call read_email to fetch full body via Mail.app.
import { startClient, handshake } from "./_client.mjs";

const query = process.argv[2] ?? "receipt";

const client = startClient();
let exitCode = 0;
try {
  await handshake(client, "smoke-read");

  console.log(`Searching for "${query}"...`);
  const searchRes = await client.send("tools/call", {
    name: "search_emails",
    arguments: { query, limit: 10 },
  });
  if (searchRes.error || searchRes.result?.isError) {
    console.error("search failed:", JSON.stringify(searchRes, null, 2));
    exitCode = 1;
    throw new Error("search failed");
  }
  const hits = JSON.parse(searchRes.result.content[0].text);
  const target = hits.find((h) => h.messageId);
  if (!target) {
    console.error("no hit with a message-id found");
    exitCode = 1;
    throw new Error("no message-id");
  }
  console.log(`Picked: "${target.subject}" from ${target.fromName ?? target.fromAddress}`);
  console.log(`        msg-id: ${target.messageId}\n`);

  console.log("Calling read_email...");
  const t0 = Date.now();
  const readRes = await client.send(
    "tools/call",
    { name: "read_email", arguments: { message_id: target.messageId } },
    120_000,
  );
  const dt = Date.now() - t0;

  if (readRes.error) {
    console.error("RPC error:", readRes.error);
    exitCode = 1;
  } else {
    const text = readRes.result?.content?.[0]?.text ?? "";
    if (readRes.result?.isError) {
      console.error(`Tool isError after ${dt}ms:\n${text}`);
      exitCode = 1;
    } else {
      const msg = JSON.parse(text);
      console.log(`Read OK in ${dt}ms.`);
      console.log(`  subject:  ${msg.subject}`);
      console.log(`  from:     ${msg.from}`);
      console.log(`  date:     ${msg.date}`);
      console.log(`  read:     ${msg.read}`);
      console.log(`  flagged:  ${msg.flagged}`);
      console.log(`  body len: ${msg.body?.length ?? 0} chars`);
      const preview = (msg.body ?? "").slice(0, 200).replace(/\s+/g, " ").trim();
      console.log(`  preview:  ${preview}${msg.body?.length > 200 ? "…" : ""}`);
    }
  }
} catch (e) {
  if (!exitCode) console.error("smoke-read failed:", e.message);
  exitCode ||= 1;
} finally {
  await client.close();
  process.exit(exitCode);
}
