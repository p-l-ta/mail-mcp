# mail-mcp

MCP server that gives Claude (and other MCP hosts) full access to **Mail.app** on macOS — search, read, send, reply, flag, move, and more — across every account configured in Mail.app (iCloud, Exchange, IMAP, etc.).

## Prerequisites

- macOS (Mail.app required)
- Node.js 20+
- An MCP host: [Claude Desktop](https://claude.ai/download), Amazon Quick, or any stdio MCP client

## Installation

### Claude Desktop — one-click install (recommended)

1. Download `mail-mcp.mcpb` from the [latest release](https://github.com/p-l-ta/mail-mcp/releases/latest)
2. Double-click the `.mcpb` file — Claude Desktop installs it automatically
3. Grant the required macOS permissions (see below)

### Manual / Amazon Quick / other hosts

```bash
npx @p-l-ta/mail-mcp
```

Or install globally:

```bash
npm install -g @p-l-ta/mail-mcp
mail-mcp
```

Point your MCP host at the `mail-mcp` binary (stdio transport). Example config:

```json
{
  "mcpServers": {
    "mail-app": {
      "command": "npx",
      "args": ["@p-l-ta/mail-mcp"]
    }
  }
}
```

## Required macOS permissions

Grant these to the application that runs the MCP host (Claude Desktop, Amazon Quick, etc.):

| Permission | Where to grant |
|---|---|
| **Full Disk Access** | System Settings → Privacy & Security → Full Disk Access |
| **Automation → Mail** | System Settings → Privacy & Security → Automation |

The MCP server process inherits permissions from the host application that launches it.

## Tools

| Tool | Description |
|---|---|
| `search_emails` | Search messages via the Envelope Index database with rich filters |
| `read_email` | Read the full body of a message by its RFC message-id |
| `list_accounts_and_mailboxes` | List all configured accounts and mailboxes with unread counts |
| `list_recent` | List recent messages in a specific mailbox |
| `list_senders` | Grouped summary of senders with message and unread counts |
| `send_email` | Send a new email from one of the configured accounts |
| `reply_to_email` | Reply to an existing message by RFC message-id |
| `set_message_flags` | Set read and/or flagged status on a message |
| `move_email` | Move a message to a different mailbox |
| `trash_email` | Move a message to Deleted Messages |
| `create_mailbox` | Create a new mailbox/folder in an account |
| `bulk_mark_read` | Mark all messages in a mailbox and/or from a sender as read |
| `get_unsubscribe_link` | Extract unsubscribe URLs from a message's headers and body |
| `empty_mailbox` | Delete every message in a mailbox at once (Junk, Trash, etc.) |

## How it works

- **Search & read** — queries Mail's own Envelope Index SQLite database directly for fast, structured results across all accounts
- **Actions** (send, reply, flag, move, trash) — driven by AppleScript automation against Mail.app, so they work even for accounts where messages aren't stored as local files

## Development

```bash
npm install
npm run dev          # tsx watch — live reload
npm test             # vitest unit tests
npm run build        # compile TypeScript → dist/
npm run mcpb         # build Claude Desktop extension → build/mail-mcp.mcpb
```

Interactive MCP testing:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/server.js
```

## Privacy Policy

mail-mcp is a **local** MCP server that runs entirely on your Mac. It has no backend, no telemetry, and makes no network requests of its own.

**What it accesses:**
- Mail.app's Envelope Index database (`~/Library/Mail/`) — read-only, used for search queries
- Mail.app via AppleScript — to read message bodies, send mail, flag, move, and trash messages

**What it does NOT do:**
- Collect, store, or transmit any data outside your Mac
- Connect to any external server or API
- Log message content anywhere

All email data stays on your device and is only passed to the MCP host (Claude Desktop or another client) as part of normal tool responses. You control exactly which tools Claude can invoke.

## License

MIT
