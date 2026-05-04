import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  message_id: z.string(),
  read: z.boolean().optional(),
  flagged: z.boolean().optional(),
};

function buildScript(opts: { read?: boolean; flagged?: boolean }): string {
  const ops: string[] = [];
  if (opts.read !== undefined) {
    ops.push(`set read status of foundMsg to ${opts.read}`);
  }
  if (opts.flagged !== undefined) {
    ops.push(`set flagged status of foundMsg to ${opts.flagged}`);
  }
  return `
    tell application "Mail"
      set foundMsg to missing value
      repeat with acct in accounts
        repeat with mb in mailboxes of acct
          set candidates to (messages of mb whose message id is theMsgId)
          if (count of candidates) > 0 then
            set foundMsg to item 1 of candidates
            ${ops.join("\n            ")}
            return "ok"
          end if
        end repeat
      end repeat
      return "not found"
    end tell
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
      const script = buildScript({ ...(read !== undefined && { read }), ...(flagged !== undefined && { flagged }) });
      const bareId = message_id.replace(/^<|>$/g, "");
      const result = await runAppleScript({
        script,
        args: { theMsgId: bareId },
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}

export const __test = { buildScript };
