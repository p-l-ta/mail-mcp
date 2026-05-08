# mail-mcp — Development & Publishing Guide

How the project is structured, how to develop locally, and the full pipeline from code change to appearing in Claude's connectors directory.

---

## Table of Contents

1. [Local development](#local-development)
2. [Project structure](#project-structure)
3. [GitHub setup](#github-setup)
4. [CI pipeline (GitHub Actions)](#ci-pipeline-github-actions)
5. [Release pipeline (GitHub Actions)](#release-pipeline-github-actions)
6. [npm publishing](#npm-publishing)
7. [Building the .mcpb extension bundle](#building-the-mcpb-extension-bundle)
8. [MCP registry (modelcontextprotocol.io)](#mcp-registry-modelcontextprotocolio)
9. [Anthropic connectors directory submission](#anthropic-connectors-directory-submission)
10. [How to cut a release](#how-to-cut-a-release)
11. [Gotchas & lessons learned](#gotchas--lessons-learned)

---

## Local development

```bash
npm install
npm run dev          # tsx watch — live-reloads src/server.ts
npm test             # vitest unit tests
npm run typecheck    # tsc --noEmit, no output files
```

Interactive end-to-end testing via MCP Inspector:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/server.js
```

This opens a browser UI where you can call each tool directly and inspect inputs/outputs.

---

## Project structure

```
src/
  server.ts          # MCP server entry point, registers all tools
  tools/             # One file per tool
  lib/
    applescript.ts   # Runs AppleScript via temp files (never osascript -e)
    spotlight.ts     # mdfind query builder
    sqlite.ts        # Queries Mail's Envelope Index database
scripts/
  build-mcpb.mjs     # Produces build/mail-mcp.mcpb
manifest.json        # MCPB bundle manifest (manifest_version 0.3)
server.json          # MCP registry entry (modelcontextprotocol.io)
package.json         # npm package (@p-l-ta/mail-mcp)
```

**Two distinct metadata files:**

| File | Purpose | Registry |
|---|---|---|
| `manifest.json` | Desktop extension bundle config | Anthropic directory |
| `server.json` | Server listing config | modelcontextprotocol.io |
| `package.json` | Node package config | npmjs.com |

These version numbers must be kept in sync manually (or via the release workflow).

---

## GitHub setup

The remote is `https://github.com/p-l-ta/mail-mcp`. To push:

```bash
git add -p                          # stage changes selectively
git commit -m "your message"
git push origin main
```

To create a release (triggers the full publish pipeline):

```bash
gh release create v1.2.3 --title "v1.2.3" --notes "What changed"
```

The `gh` CLI handles tag creation and release publishing in one step.

---

## CI pipeline (GitHub Actions)

**File:** `.github/workflows/ci.yml`

Runs on every push to `main` and on pull requests. Uses `ubuntu-latest` (faster/cheaper than macOS — the macOS-specific code is only needed at build time, not test time).

Steps:
1. Checkout
2. Set up Node 24
3. `npm ci`
4. `npm test` (vitest)

No secrets required. This catches TypeScript and test failures before they reach a release.

---

## Release pipeline (GitHub Actions)

**File:** `.github/workflows/release.yml`

Triggered when a GitHub Release is **published** (i.e. `gh release create` or clicking Publish on GitHub). Runs on `macos-latest` because `npm run mcpb` uses `zip` and npm install, which need to produce a macOS-compatible bundle.

Steps:
1. Checkout + Node 24 setup
2. `npm ci`
3. `npm run build` — compiles TypeScript → `dist/`
4. `npm run mcpb` — bundles `dist/` + `manifest.json` + production `node_modules` into `build/mail-mcp.mcpb`
5. Upload `mail-mcp.mcpb` as a release asset (`gh release upload`)
6. `npm publish --access public --provenance` — publishes to npm
7. Download `mcp-publisher`, update `server.json` versions, and publish to the MCP registry

**Required permissions** (set in the workflow `permissions:` block):
- `contents: write` — to upload release assets
- `id-token: write` — for OIDC token exchange (used by both npm provenance and mcp-publisher)

No static secrets are stored in GitHub. Both npm and the MCP registry authenticate via GitHub's OIDC tokens.

---

## npm publishing

### Package name

The package is scoped: `@p-l-ta/mail-mcp`. The unscoped name `mail-mcp` was rejected by npm as too similar to the existing package `mailmcp`.

### First publish (one-time manual step)

OIDC provenance can only be configured for a package that already exists on npm. So the very first publish had to be done manually:

```bash
npm login                          # log in with a token that has publish + bypass-2FA
npm publish --access public        # first-time publish, no --provenance
```

After that, configure OIDC trust on npmjs.com:
- npmjs.com → package settings → Publishing access → "Require 2FA or automation tokens"... no, actually:
- npmjs.com → package settings → `@p-l-ta/mail-mcp` → Publishing access → add the GitHub Actions OIDC publisher

### Subsequent publishes

All subsequent publishes go through the release workflow with `--provenance`. No token in GitHub Secrets. The `id-token: write` permission is enough — GitHub mints an OIDC token, npm exchanges it, done.

### What gets published

Controlled by the `files` field in `package.json`:

```json
"files": ["dist", "manifest.json"]
```

Source, tests, build artifacts, and scripts are excluded. Users get exactly what they need to run the server.

### Version bumping

npm will refuse to publish over an existing version. Always bump `version` in `package.json` before cutting a release.

---

## Building the .mcpb extension bundle

**Script:** `scripts/build-mcpb.mjs`

An `.mcpb` file is a zip archive containing:

```
manifest.json
package.json          (devDependencies and scripts stripped)
dist/                 (compiled JS)
node_modules/         (production deps only — no devDependencies)
```

Why bundle `node_modules`? Claude Desktop runs the extension in isolation — it won't run `npm install` first. The bundle must be self-contained.

```bash
npm run build    # must run first — mcpb script doesn't recompile
npm run mcpb     # produces build/mail-mcp.mcpb
```

The release workflow runs both steps automatically.

### manifest.json

Governed by the [MCPB spec](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md). Key fields:

```json
{
  "manifest_version": "0.3",      // current spec version — check the repo for updates
  "name": "mail-mcp",
  "display_name": "Mail.app",
  "privacy_policies": [
    { "url": "https://github.com/p-l-ta/mail-mcp#privacy-policy" }
  ],
  "tools": [
    { "name": "search_emails", "description": "..." }
  ],
  "server": {
    "type": "node",
    "entry_point": "dist/server.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/server.js"]
    }
  }
}
```

The `tools` array in the manifest only takes `name` and `description`. Tool annotations (`title`, `readOnlyHint`, `destructiveHint`) belong in the TypeScript source (see below), not here.

### Tool annotations in TypeScript

The MCP SDK's `server.tool()` accepts an annotations object as the 4th argument (before the callback):

```typescript
server.tool(
  "search_emails",
  "Search Mail.app messages...",
  schema,
  { title: "Search Emails", readOnlyHint: true, destructiveHint: false },
  async (args) => { ... }
);
```

Annotations for all 14 tools:

| Tool | readOnlyHint | destructiveHint |
|---|---|---|
| `search_emails` | true | false |
| `read_email` | true | false |
| `list_accounts_and_mailboxes` | true | false |
| `list_recent` | true | false |
| `list_senders` | true | false |
| `get_unsubscribe_link` | true | false |
| `send_email` | false | true |
| `reply_to_email` | false | true |
| `trash_email` | false | true |
| `empty_mailbox` | false | true |
| `set_message_flags` | false | false |
| `move_email` | false | false |
| `bulk_mark_read` | false | false |
| `create_mailbox` | false | false |

---

## MCP registry (modelcontextprotocol.io)

The [MCP registry](https://registry.modelcontextprotocol.io) is a community directory of MCP servers, separate from Anthropic's directory. It's used by Claude Desktop's "Add integration" search.

### server.json

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.p-l-ta/mail-mcp",
  "title": "Mail.app",
  "description": "...",
  "repository": { "url": "https://github.com/p-l-ta/mail-mcp", "source": "github" },
  "version": "1.0.3",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@p-l-ta/mail-mcp",
      "version": "1.0.2",
      "transport": { "type": "stdio" }
    }
  ]
}
```

`version` (top-level) is the registry entry version. `packages[0].version` is the npm package version. The release workflow updates both automatically via `jq`.

### Publishing via mcp-publisher

```bash
# Install the CLI
curl -fsSL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_darwin_arm64.tar.gz" | tar -xz -C /usr/local/bin

# Login (JWT expires in 5 minutes — do this immediately before publish)
mcp-publisher login github-oidc     # in CI; or:
mcp-publisher login                 # locally, opens browser

# Publish
mcp-publisher publish
```

The release workflow does this automatically after updating `server.json` with the new version numbers.

**You cannot republish an existing version.** Bump both version numbers in `server.json` with every release.

### Search indexing delay

After publishing, the server appears at its direct URL immediately:

```
https://registry.modelcontextprotocol.io/v0.1/servers/io.github.p-l-ta%2Fmail-mcp/versions/1.0.3
```

But it may take hours or days to appear in keyword search results. This is a known issue ([registry #960](https://github.com/modelcontextprotocol/registry/issues/960)).

---

## Anthropic connectors directory submission

This is separate from the MCP registry — it's Anthropic's curated directory surfaced inside Claude Desktop.

**Submission form:** https://clau.de/desktop-extention-submission

### What to prepare

- **Server name, tagline, description** — from `manifest.json`
- **Privacy policy URL** — `https://github.com/p-l-ta/mail-mcp#privacy-policy`
- **Tool annotations confirmed** — all 14 tools have `title`, `readOnlyHint`, `destructiveHint`
- **Documentation link** — the GitHub README
- **Support link** — `https://github.com/p-l-ta/mail-mcp/issues`
- **The `.mcpb` file** — attached from the latest GitHub release
- **Category** — Productivity / Email
- **Tested surfaces** — Claude Desktop (macOS)

### Requirements checklist (from review-criteria docs)

- [ ] Every tool has a `title` annotation
- [ ] Every tool has the appropriate `readOnlyHint` or `destructiveHint`
- [ ] Privacy policy section exists and is at a stable HTTPS URL
- [ ] `manifest_version` is current (currently `"0.3"`)
- [ ] `platforms: ["darwin"]` set (macOS only)
- [ ] All tools tested via MCP Inspector before submitting
- [ ] No prompt injection patterns in tool descriptions
- [ ] Tool descriptions contain no misleading claims

---

## How to cut a release

1. **Bump versions** in three files:
   - `package.json` → `"version": "x.y.z"`
   - `server.json` → `"version": "x.y.z"` and `"packages[0].version": "x.y.z"`
   - `manifest.json` → `"version": "x.y.z"` (for the .mcpb bundle)

2. **Commit and push:**
   ```bash
   git add package.json server.json manifest.json
   git commit -m "chore: bump to vx.y.z"
   git push origin main
   ```

3. **Create the GitHub release:**
   ```bash
   gh release create vx.y.z --title "vx.y.z" --notes "What changed"
   ```

4. **Watch the pipeline** at `https://github.com/p-l-ta/mail-mcp/actions` — it will:
   - Build `mail-mcp.mcpb`
   - Attach it to the release
   - Publish `@p-l-ta/mail-mcp@x.y.z` to npm
   - Update and publish `server.json` to the MCP registry

5. **Verify:**
   ```bash
   # npm
   npm show @p-l-ta/mail-mcp version

   # MCP registry
   curl -s "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.p-l-ta%2Fmail-mcp/versions/x.y.z" | python3 -m json.tool
   ```

---

## Gotchas & lessons learned

**npm package names** — scoped packages (`@org/name`) bypass similarity checks. Unscoped `mail-mcp` was rejected as too similar to `mailmcp`. Use `@p-l-ta/mail-mcp`.

**OIDC chicken-and-egg** — npm OIDC trust can only be configured for packages that already exist. The very first publish must be manual with a classic token. After that, OIDC takes over.

**`gh release upload` without `--clobber`** — fails if the asset already exists (e.g. re-running a workflow). Always use `--clobber`.

**`actions/checkout@v4` and `actions/setup-node@v4`** — these use Node 20 internally and emit deprecation warnings in GitHub Actions. Use `@v5` to avoid the noise.

**MCP registry JWT expires in 5 minutes** — `mcp-publisher login` opens a browser flow that mints a short-lived JWT. In CI, use `mcp-publisher login github-oidc` which exchanges the GitHub Actions OIDC token instead.

**Cannot republish a registry version** — unlike npm (which gives a clear 403), the MCP registry may silently fail or error if you try to re-publish the same version. Always bump `server.json` version numbers.

**`manifest_version` vs `dxt_version`** — the old format used `dxt_version: "0.1"`, and the old extension format was `.dxt`. Both are now superseded: use `manifest_version: "0.3"` and `.mcpb`. The spec lives at `github.com/modelcontextprotocol/mcpb` (not `anthropics/mcpb`).

**Tool annotations in the wrong place** — `title`, `readOnlyHint`, `destructiveHint` belong in the TypeScript `server.tool()` call, not in `manifest.json`'s tools array. The manifest only takes `name` and `description` per tool.

**macOS permissions belong to the host app** — the MCP server process inherits permissions from whatever app launches it (Claude Desktop, etc.). Telling users to grant Full Disk Access to "the node binary" is wrong. They grant it to Claude Desktop (or whichever host they use), and the MCP server inherits it automatically.
