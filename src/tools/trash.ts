import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findMessageAndAct, MESSAGE_NOT_FOUND } from "../lib/find-message.js";

const schema = {
  message_id: z.string().describe("RFC message-id (with or without angle brackets)"),
};

const ACTION = `
  delete foundMsg
  return "ok"
`;

export function register(server: McpServer): void {
  server.tool(
    "trash_email",
    "Move a message to Deleted Messages (trash) by RFC message-id. Does not permanently delete.",
    schema,
    { title: "Trash Email", readOnlyHint: false, destructiveHint: true },
    async ({ message_id }) => {
      const result = await findMessageAndAct({
        messageId: message_id,
        action: ACTION,
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
