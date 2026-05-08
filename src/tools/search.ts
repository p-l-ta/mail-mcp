import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchMessages, type SearchFilters } from "../lib/envelope-index.js";

const schema = {
  query: z.string().optional().describe(
    "Free-text search across subject, sender, and body summary. Omit to list-only by other filters.",
  ),
  from: z.string().optional().describe("Substring match on sender address or display name"),
  subject: z.string().optional().describe("Substring match on subject"),
  since: z.string().optional().describe("ISO date — only messages on or after this date"),
  account: z.string().optional().describe("Substring match against the full mailbox URL (host and path). Use the account hostname to target an account (e.g. 'icloud'), or a mailbox path segment to target a specific folder (e.g. 'INBOX', 'Amtrak')."),
  include_deleted: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
};

export function register(server: McpServer): void {
  server.tool(
    "search_emails",
    "Search Mail.app messages via the Envelope Index database. Returns rich metadata including RFC message-id (usable with read_email, reply_to_email, set_message_flags).",
    schema,
    async ({ query, from, subject, since, account, include_deleted, limit }) => {
      if (!query && !from && !subject && !since && !account) {
        return {
          content: [
            {
              type: "text",
              text: 'At least one filter is required (query, from, subject, since, or account).',
            },
          ],
          isError: true,
        };
      }
      const filters: SearchFilters = {
        limit,
        include_deleted,
        ...(query !== undefined && { query }),
        ...(from !== undefined && { from }),
        ...(subject !== undefined && { subject }),
        ...(since !== undefined && { since }),
        ...(account !== undefined && { account }),
      };
      const hits = await searchMessages(filters);
      return {
        content: [{ type: "text", text: JSON.stringify(hits, null, 2) }],
      };
    },
  );
}
