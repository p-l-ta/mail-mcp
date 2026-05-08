import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  message_id: z.string().describe("RFC message-id (with or without angle brackets)"),
};

// Get truncated raw source (headers only — 8 KB is plenty for all headers)
// plus the plain-text content for body link scanning.
const SCRIPT = `
  tell application "Mail"
    set foundMsg to missing value
    repeat with acct in accounts
      repeat with mb in mailboxes of acct
        set candidates to (messages of mb whose message id is theMsgId)
        if (count of candidates) > 0 then
          set foundMsg to item 1 of candidates
          exit repeat
        end if
      end repeat
      if foundMsg is not missing value then exit repeat
    end repeat
    if foundMsg is missing value then return "NOTFOUND"

    set src to source of foundMsg
    if (count of characters of src) > 8000 then
      set src to text 1 thru 8000 of src
    end if
    set msgContent to content of foundMsg
    return src & "|||SPLIT|||" & msgContent
  end tell
`;

const SPLIT = "|||SPLIT|||";

export function extractUnsubscribeUrls(raw: string): { header: string[]; body: string[] } {
  const splitIdx = raw.indexOf(SPLIT);
  const headers = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
  const body = splitIdx >= 0 ? raw.slice(splitIdx + SPLIT.length) : "";

  const header: string[] = [];
  const bodyUrls: string[] = [];

  // List-Unsubscribe header may be folded (continuation lines start with whitespace)
  const match = headers.match(/^List-Unsubscribe:[ \t]*((?:[^\r\n]|\r?\n[ \t])*)/im);
  if (match) {
    const value = (match[1] ?? "").replace(/\r?\n[ \t]+/g, " ");
    for (const m of value.matchAll(/<([^>]+)>/g)) {
      if (m[1]) header.push(m[1]);
    }
  }

  // Scan plain-text body for URLs that look like unsubscribe links
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;
  for (const m of body.matchAll(urlRe)) {
    const url = m[0].replace(/[.,;]+$/, "");
    if (/unsubscribe|opt.?out|optout|remove/i.test(url) && !header.includes(url) && !bodyUrls.includes(url)) {
      bodyUrls.push(url);
    }
  }

  return { header, body: bodyUrls };
}

export function register(server: McpServer): void {
  server.tool(
    "get_unsubscribe_link",
    "Extract unsubscribe URLs from a message — checks the List-Unsubscribe header first (reliable), then scans the plain-text body as a fallback.",
    schema,
    async ({ message_id }) => {
      const bareId = message_id.replace(/^<|>$/g, "");
      const raw = await runAppleScript({
        script: SCRIPT,
        args: { theMsgId: bareId },
        timeoutMs: 30_000,
      });
      if (raw === "NOTFOUND") {
        return {
          content: [{ type: "text", text: `No message found with id ${message_id}` }],
          isError: true,
        };
      }
      const urls = extractUnsubscribeUrls(raw);
      return {
        content: [{ type: "text", text: JSON.stringify(urls, null, 2) }],
      };
    },
  );
}

export const __test = { extractUnsubscribeUrls };
