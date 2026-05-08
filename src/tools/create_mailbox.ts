import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  name: z.string().describe("Name for the new mailbox/folder"),
  account: z.string().optional().describe("Account name to create it in. Required when multiple accounts are configured; use name from list_accounts_and_mailboxes."),
};

const SCRIPT = `
  tell application "Mail"
    set targetAcct to missing value
    repeat with acct in accounts
      if theAcct is "" or (name of acct) contains theAcct then
        set targetAcct to acct
        exit repeat
      end if
    end repeat
    if targetAcct is missing value then return "account not found"
    make new mailbox with properties {name: theMailboxName} at targetAcct
    return "ok"
  end tell
`;

export function register(server: McpServer): void {
  server.tool(
    "create_mailbox",
    "Create a new mailbox (folder) in a Mail.app account.",
    schema,
    { title: "Create Mailbox", readOnlyHint: false, destructiveHint: false },
    async ({ name, account }) => {
      const result = await runAppleScript({
        script: SCRIPT,
        args: {
          theMailboxName: name,
          theAcct: account ?? "",
        },
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}
