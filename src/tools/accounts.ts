import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript } from "../lib/applescript.js";

const SCRIPT = `
  set buf to ""
  tell application "Mail"
    repeat with acct in accounts
      set buf to buf & "ACCOUNT" & tab & (name of acct) & tab & (user name of acct) & linefeed
      repeat with mb in mailboxes of acct
        set buf to buf & "MAILBOX" & tab & (name of mb) & tab & ((unread count of mb) as string) & linefeed
      end repeat
    end repeat
  end tell
  return buf
`;

interface Mailbox {
  name: string;
  unread: number;
}
interface Account {
  name: string;
  user: string;
  mailboxes: Mailbox[];
}

function parse(raw: string): Account[] {
  const accounts: Account[] = [];
  let current: Account | null = null;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const [kind, a, b] = line.split("\t");
    if (kind === "ACCOUNT") {
      current = { name: a ?? "", user: b ?? "", mailboxes: [] };
      accounts.push(current);
    } else if (kind === "MAILBOX" && current) {
      current.mailboxes.push({ name: a ?? "", unread: Number(b) || 0 });
    }
  }
  return accounts;
}

export function register(server: McpServer): void {
  server.tool(
    "list_accounts_and_mailboxes",
    "List all configured Mail.app accounts and their mailboxes with unread counts.",
    {},
    async () => {
      const raw = await runAppleScript({ script: SCRIPT });
      const accounts = parse(raw);
      return {
        content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }],
      };
    },
  );
}

export const __test = { parse, SCRIPT };
