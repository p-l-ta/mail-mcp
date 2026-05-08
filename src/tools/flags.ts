import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findMessageAndAct, MESSAGE_NOT_FOUND } from "../lib/find-message.js";

const schema = {
  message_id: z.string(),
  read: z.boolean().optional(),
  flagged: z.boolean().optional(),
};

export function buildAction(opts: { read?: boolean; flagged?: boolean }): string {
  const ops: string[] = [];
  if (opts.read !== undefined) ops.push(`set read status of foundMsg to ${opts.read}`);
  if (opts.flagged !== undefined) ops.push(`set flagged status of foundMsg to ${opts.flagged}`);
  return `
    ${ops.join("\n    ")}
    return "ok"
  `;
}

export function register(server: McpServer): void {
  server.tool(
    "set_message_flags",
    "Set read and/or flagged status on a message identified by RFC message-id.",
    schema,
    async ({ message_id, read, flagged }) => {
      if (read === undefined && flagged === undefined) {
        return { content: [{ type: "text", text: "No-op (no flags supplied)" }] };
      }
      const action = buildAction({
        ...(read !== undefined && { read }),
        ...(flagged !== undefined && { flagged }),
      });
      const result = await findMessageAndAct({
        messageId: message_id,
        action,
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

export const __test = { buildAction };
