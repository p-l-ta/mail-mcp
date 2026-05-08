import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  mailbox: z.string().optional().describe("Restrict to this exact mailbox name. At least one of mailbox or from is required."),
  from: z.string().optional().describe("Substring to match against the sender field. At least one of mailbox or from is required."),
  account: z.string().optional().describe("Restrict to this account name."),
};

// Iterates explicitly rather than using a compound `whose` clause to ensure
// compatibility across different Mail.app versions.
const SCRIPT = `
  tell application "Mail"
    set markedCount to 0
    repeat with acct in accounts
      if theAcct is "" or (name of acct) contains theAcct then
        repeat with mb in mailboxes of acct
          if theMailbox is "" or (name of mb) is theMailbox then
            set msgs to messages of mb
            repeat with m in msgs
              if (read status of m) is false then
                if theSender is "" or (sender of m) contains theSender then
                  set read status of m to true
                  set markedCount to markedCount + 1
                end if
              end if
            end repeat
          end if
        end repeat
      end if
    end repeat
    return (markedCount as string) & " messages marked read"
  end tell
`;

export function register(server: McpServer): void {
  server.tool(
    "bulk_mark_read",
    "Mark multiple messages as read in one call — by mailbox, sender substring, or both. Far faster than calling set_message_flags per message.",
    schema,
    { title: "Bulk Mark Read", readOnlyHint: false, destructiveHint: false },
    async ({ mailbox, from, account }) => {
      if (!mailbox && !from) {
        return {
          content: [{ type: "text", text: "At least one of mailbox or from is required." }],
          isError: true,
        };
      }
      const result = await runAppleScript({
        script: SCRIPT,
        args: {
          theMailbox: mailbox ?? "",
          theSender: from ?? "",
          theAcct: account ?? "",
        },
        timeoutMs: 120_000,
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}
