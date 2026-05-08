import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const schema = {
  to: z.string().describe("Primary recipient email address"),
  cc: z.string().optional().describe("CC recipient email address"),
  subject: z.string(),
  body: z.string(),
  from_account: z
    .string()
    .optional()
    .describe("Account name to send from (matches Mail.app account name)"),
};

const SCRIPT = `
  tell application "Mail"
    set newMsg to make new outgoing message with properties {subject:theSubject, content:theBody, visible:false}
    if fromAccount is not "" then
      set sender of newMsg to fromAccount
    end if
    tell newMsg
      make new to recipient at end of to recipients with properties {address:theTo}
      if theCc is not "" then
        make new cc recipient at end of cc recipients with properties {address:theCc}
      end if
    end tell
    send newMsg
  end tell
  return "sent"
`;

export function register(server: McpServer): void {
  server.tool(
    "send_email",
    "Send a new email via Mail.app from an existing account.",
    schema,
    { title: "Send Email", readOnlyHint: false, destructiveHint: true },
    async ({ to, cc, subject, body, from_account }) => {
      await runAppleScript({
        script: SCRIPT,
        args: {
          theTo: to,
          theCc: cc ?? "",
          theSubject: subject,
          theBody: body,
          fromAccount: from_account ?? "",
        },
      });
      return { content: [{ type: "text", text: `Email sent to ${to}` }] };
    },
  );
}
