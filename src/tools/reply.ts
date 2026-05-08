import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findMessageAndAct, MESSAGE_NOT_FOUND } from "../lib/find-message.js";

const schema = {
  message_id: z.string().describe("RFC message-id from search/list results"),
  body: z.string(),
  reply_all: z.boolean().default(false),
};

const ACTION = `
  set replyAll to (replyAllStr is "true")
  if replyAll then
    set replyMsg to reply foundMsg opening window no reply to all true
  else
    set replyMsg to reply foundMsg opening window no reply to all false
  end if
  set content of replyMsg to theBody
  send replyMsg
  return "replied"
`;

export function register(server: McpServer): void {
  server.tool(
    "reply_to_email",
    "Reply to an existing message identified by RFC message-id.",
    schema,
    { title: "Reply to Email", readOnlyHint: false, destructiveHint: true },
    async ({ message_id, body, reply_all }) => {
      const result = await findMessageAndAct({
        messageId: message_id,
        action: ACTION,
        extraArgs: {
          theBody: body,
          replyAllStr: reply_all ? "true" : "false",
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
