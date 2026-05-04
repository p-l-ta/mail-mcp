import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  message_id: z.string().describe("RFC message-id from search/list results"),
  body: z.string(),
  reply_all: z.boolean().default(false),
};

const SCRIPT = `
  set replyAll to (replyAllStr is "true")
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
    if foundMsg is missing value then return "Message not found"
    if replyAll then
      set replyMsg to reply foundMsg opening window no reply to all true
    else
      set replyMsg to reply foundMsg opening window no reply to all false
    end if
    set content of replyMsg to theBody
    send replyMsg
    return "replied"
  end tell
`;

export function register(server: McpServer): void {
  server.tool(
    "reply_to_email",
    "Reply to an existing message identified by RFC message-id.",
    schema,
    async ({ message_id, body, reply_all }) => {
      const bareId = message_id.replace(/^<|>$/g, "");
      const result = await runAppleScript({
        script: SCRIPT,
        args: {
          theMsgId: bareId,
          theBody: body,
          replyAllStr: reply_all ? "true" : "false",
        },
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}
