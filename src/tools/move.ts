import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findMessageAndAct, MESSAGE_NOT_FOUND } from "../lib/find-message.js";

const schema = {
  message_id: z.string().describe("RFC message-id (with or without angle brackets)"),
  destination_mailbox: z.string().describe("Exact mailbox name from list_accounts_and_mailboxes (slash-pathed for nested, e.g. 'Folders/Amtrak')"),
  destination_account: z.string().optional().describe("Account name to disambiguate if multiple accounts share the mailbox name"),
};

// Action runs after foundMsg is bound. Walks accounts to find the destination
// mailbox by name (and optionally account), then moves.
const ACTION = `
  set destMb to missing value
  repeat with acct in accounts
    if destAcct is "" or (name of acct) contains destAcct then
      try
        set destMb to mailbox destMailbox of acct
        exit repeat
      end try
    end if
  end repeat
  if destMb is missing value then return "destination not found"

  move foundMsg to destMb
  return "ok"
`;

export function register(server: McpServer): void {
  server.tool(
    "move_email",
    "Move a message to a different mailbox by RFC message-id. Use list_accounts_and_mailboxes to get exact mailbox names.",
    schema,
    async ({ message_id, destination_mailbox, destination_account }) => {
      const result = await findMessageAndAct({
        messageId: message_id,
        action: ACTION,
        extraArgs: {
          destMailbox: destination_mailbox,
          destAcct: destination_account ?? "",
        },
      });
      if (result === MESSAGE_NOT_FOUND) {
        return {
          content: [{ type: "text", text: `No message found with id ${message_id}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: result }] };
    },
  );
}
