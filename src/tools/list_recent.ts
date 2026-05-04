import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  account: z.string().describe("Account name as shown in Mail.app"),
  mailbox: z.string().default("INBOX"),
  limit: z.number().int().min(1).max(50).default(10),
  unread_only: z.boolean().default(false),
};

const FIELD_SEP = String.fromCharCode(31);

const SCRIPT = `
  set lim to (limStr as integer)
  set unreadOnly to (unreadOnlyStr is "true")

  tell application "Mail"
    set acct to first account whose name is acctName
    set mb to mailbox mbName of acct
    if unreadOnly then
      set msgs to (messages of mb whose read status is false)
    else
      set msgs to messages of mb
    end if

    set total to count of msgs
    if total > lim then set total to lim

    set buf to ""
    repeat with i from 1 to total
      set msg to item i of msgs
      set sub to (subject of msg) as string
      set sndr to (sender of msg) as string
      set dat to ((date received of msg) as string)
      set msgId to (message id of msg) as string
      set unreadFlag to (not (read status of msg))

      -- replace any embedded field separators in subject/sender with spaces
      set AppleScript's text item delimiters to (character id 31)
      set sub to text items of sub
      set AppleScript's text item delimiters to " "
      set sub to sub as string
      set AppleScript's text item delimiters to (character id 31)
      set sndr to text items of sndr
      set AppleScript's text item delimiters to " "
      set sndr to sndr as string

      set buf to buf & sub & (character id 31) & sndr & (character id 31) & dat & (character id 31) & (unreadFlag as string) & (character id 31) & msgId & linefeed
    end repeat
    return buf
  end tell
`;

interface RecentMsg {
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  messageId: string;
}

function parse(raw: string): RecentMsg[] {
  const out: RecentMsg[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const parts = line.split(FIELD_SEP);
    if (parts.length < 5) continue;
    out.push({
      subject: parts[0] ?? "",
      from: parts[1] ?? "",
      date: parts[2] ?? "",
      unread: parts[3] === "true",
      messageId: parts[4] ?? "",
    });
  }
  return out;
}

export function register(server: McpServer): void {
  server.tool(
    "list_recent",
    "List recent messages in a mailbox of a specific account.",
    schema,
    async ({ account, mailbox, limit, unread_only }) => {
      const raw = await runAppleScript({
        script: SCRIPT,
        args: {
          acctName: account,
          mbName: mailbox,
          limStr: String(limit),
          unreadOnlyStr: unread_only ? "true" : "false",
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(parse(raw), null, 2) }],
      };
    },
  );
}

export const __test = { parse, SCRIPT };
