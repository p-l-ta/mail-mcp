import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  message_id: z.string().describe(
    "RFC message-id (with angle brackets) from search_emails / list_recent results",
  ),
};

const FIELD_SEP = String.fromCharCode(31);

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

    set msgSubject to (subject of foundMsg) as string
    set msgSender to (sender of foundMsg) as string
    set msgDate to ((date received of foundMsg) as string)
    set msgBody to (content of foundMsg) as string
    if (read status of foundMsg) then
      set readFlag to "true"
    else
      set readFlag to "false"
    end if
    if (flagged status of foundMsg) then
      set flaggedFlag to "true"
    else
      set flaggedFlag to "false"
    end if

    return msgSubject & (character id 31) & msgSender & (character id 31) & msgDate & (character id 31) & readFlag & (character id 31) & flaggedFlag & (character id 31) & msgBody
  end tell
`;

export function register(server: McpServer): void {
  server.tool(
    "read_email",
    "Read full body of a message by its RFC message-id. Uses Mail.app via AppleScript so it works for IMAP/iCloud/Exchange messages without filesystem access.",
    schema,
    async ({ message_id }) => {
      const bareId = message_id.replace(/^<|>$/g, "");
      const raw = await runAppleScript({
        script: SCRIPT,
        args: { theMsgId: bareId },
      });
      if (raw === "NOTFOUND") {
        return {
          content: [{ type: "text", text: `No message found with id ${message_id}` }],
          isError: true,
        };
      }
      const parts = raw.split(FIELD_SEP);
      const result = {
        subject: parts[0] ?? "",
        from: parts[1] ?? "",
        date: parts[2] ?? "",
        read: parts[3] === "true",
        flagged: parts[4] === "true",
        body: parts.slice(5).join(FIELD_SEP),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

export const __test = { FIELD_SEP, SCRIPT };
