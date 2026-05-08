import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  mailbox_name: z.string().describe("Exact mailbox name to empty (e.g. 'Junk', 'Deleted Messages'). Use list_accounts_and_mailboxes for exact names."),
  account: z.string().optional().describe("Account name to disambiguate when the same mailbox name exists in multiple accounts"),
};

// delete in Mail.app moves to Deleted Messages; messages already in Deleted
// Messages are permanently removed, which is intentional when emptying trash.
const SCRIPT = `
  tell application "Mail"
    set targetMb to missing value
    repeat with acct in accounts
      if theAcct is "" or (name of acct) contains theAcct then
        repeat with mb in mailboxes of acct
          if (name of mb) is theMailbox then
            set targetMb to mb
            exit repeat
          end if
        end repeat
        if targetMb is not missing value then exit repeat
      end if
    end repeat
    if targetMb is missing value then return "mailbox not found"
    set msgCount to (count of messages of targetMb)
    delete every message of targetMb
    return (msgCount as string) & " messages deleted"
  end tell
`;

export function register(server: McpServer): void {
  server.tool(
    "empty_mailbox",
    "Delete every message in a mailbox at once — moves to Deleted Messages, or permanently removes if the mailbox is already Deleted Messages/Trash. Use for Junk, Trash, or bulk-cleanup folders.",
    schema,
    async ({ mailbox_name, account }) => {
      const result = await runAppleScript({
        script: SCRIPT,
        args: {
          theMailbox: mailbox_name,
          theAcct: account ?? "",
        },
        timeoutMs: 120_000,
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}
