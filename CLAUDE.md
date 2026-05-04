# mail-mcp

Local MCP server that exposes Mail.app to Claude Cowork, giving Cowork
Gmail-connector-like behavior across all mail accounts configured in Mail.app
(iCloud, Exchange, IMAP, etc.).

## Architecture

- **Search & read**: Spotlight (`mdfind`) + direct `.emlx` parsing with `mailparser`.
  Fast, structured, no AppleScript text-scraping.
- **Actions** (send, reply, flag, move): AppleScript via `osascript`, run from
  temp script files (never inline strings — escaping is a footgun).
- **Transport**: stdio. Claude Desktop bridges this into Cowork via its SDK layer.

## Layout

- `src/server.ts` — MCP server entry, tool registration
- `src/tools/` — one file per tool (search, read, send, reply, flags, etc.)
- `src/lib/applescript.ts` — temp-file runner
- `src/lib/emlx.ts` — Apple's emlx wrapper around RFC-822
- `src/lib/spotlight.ts` — mdfind query builder
- `prototype.js` — original single-file sketch, reference only

## Conventions

- TypeScript, ES modules, Node 20+
- Zod schemas for every tool input
- Tool outputs are JSON strings inside `{ type: "text" }` content blocks
- AppleScript is generated as full scripts written to tmp files, then executed
  with `execFile("osascript", [path])`. Never use `osascript -e` with template
  strings.
- Every tool has a vitest unit test with mocked `execFile` / `mdfind` / fs

## Permissions required at runtime

- Automation → Mail.app (System Settings → Privacy & Security → Automation)
- Full Disk Access for the node binary (to read ~/Library/Mail/)

## Testing

- `npm test` — vitest
- `npm run dev` — tsx watch on src/server.ts (manual MCP testing via inspector)
- Use `npx @modelcontextprotocol/inspector node dist/server.js` for interactive testing

## Out of scope

- Gmail (Cowork already has a connector for that)
- Remote/HTTP transport (this is a local stdio server bridged through Desktop)
- Rendering HTML email bodies (return text/plain; expose HTML availability flag only)

## Node version

This project requires Node 20+ (see `.nvmrc`). If using fnm: `fnm use`.
