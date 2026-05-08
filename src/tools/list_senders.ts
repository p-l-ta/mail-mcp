import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { locateEnvelopeIndex, querySqlite } from "../lib/envelope-index.js";

const schema = {
  mailbox: z.string().optional().describe("Mailbox name or URL substring to restrict to (e.g. 'Amtrak', 'INBOX')"),
  account: z.string().optional().describe("Account host/name substring to restrict to"),
  limit: z.number().int().min(1).max(500).default(50).describe("Max senders to return, ordered by message count desc"),
};

interface SenderRow {
  sender_address: string | null;
  sender_name: string | null;
  message_count: number;
  unread_count: number;
  last_received: number | null;
}

function sqlEscape(v: string): string {
  return v.replace(/'/g, "''");
}

export function buildSql(mailbox?: string, account?: string, limit = 50): string {
  const where: string[] = ["m.deleted = 0"];
  if (mailbox) where.push(`mb.url LIKE '%${sqlEscape(mailbox)}%'`);
  if (account) where.push(`mb.url LIKE '%${sqlEscape(account)}%'`);
  return `
    SELECT
      a.address                                        AS sender_address,
      a.comment                                        AS sender_name,
      COUNT(*)                                         AS message_count,
      SUM(CASE WHEN m.read = 0 THEN 1 ELSE 0 END)     AS unread_count,
      MAX(m.date_received)                             AS last_received
    FROM messages m
    LEFT JOIN addresses a  ON a.ROWID = m.sender
    LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
    WHERE ${where.join(" AND ")}
    GROUP BY a.address, a.comment
    ORDER BY message_count DESC
    LIMIT ${Math.max(1, Math.floor(limit))};
  `;
}

export function register(server: McpServer): void {
  server.tool(
    "list_senders",
    "Return a grouped count of senders in a mailbox — who sends how many messages, how many are unread, and when the last arrived. Ideal for identifying bulk senders and noise.",
    schema,
    async ({ mailbox, account, limit }) => {
      const dbPath = await locateEnvelopeIndex();
      const sql = buildSql(mailbox, account, limit);
      const rows = await querySqlite<SenderRow>(dbPath, sql);
      const result = rows.map((r) => ({
        address: r.sender_address,
        name: r.sender_name || null,
        count: Number(r.message_count),
        unread: Number(r.unread_count),
        lastReceived: r.last_received ? new Date(r.last_received * 1000).toISOString() : null,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

export const __test = { buildSql };
