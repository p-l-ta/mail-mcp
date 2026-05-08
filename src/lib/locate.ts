import { locateEnvelopeIndex, querySqlite } from "./envelope-index.js";

/**
 * Where a specific message lives in Mail.app, expressed in terms the
 * AppleScript dictionary can target directly:
 *   - userName    → matches `user name of account`
 *   - mailboxPath → matches `mailbox <path> of <account>` (slash-pathed
 *                   nested mailboxes work, e.g. "Folders/Amtrak").
 */
export interface MessageLocation {
  userName: string;
  mailboxPath: string;
  /** Raw URL from the Envelope Index, useful for debugging. */
  mailboxUrl: string;
}

/**
 * Parse a mailbox URL from the Envelope Index into Mail.app navigation params.
 * Supports imap://, imaps://, ews://, pops://, etc. Returns null for forms we
 * can't navigate by `(account whose user name is …)` — e.g. local "On My Mac"
 * mailboxes (`local-mailboxes:`).
 */
export function parseMailboxUrl(url: string): {
  userName: string;
  mailboxPath: string;
} | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Local mailboxes have no user; we have no reliable way to target them
  // via the user-name shortcut.
  if (!parsed.username) return null;

  const userName = decodeURIComponent(parsed.username);
  const mailboxPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!userName || !mailboxPath) return null;

  return { userName, mailboxPath };
}

interface CacheEntry {
  value: MessageLocation | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

/**
 * Look up where a message lives via the Envelope Index, so the caller can
 * navigate directly to it instead of scanning every mailbox of every account.
 *
 * Returns null when the message isn't in the index (e.g. just-arrived mail
 * that hasn't been indexed yet, or a local mailbox we can't navigate by user)
 * — callers should fall back to a brute-force scan in that case.
 */
export async function locateMessage(
  rfcMessageId: string,
): Promise<MessageLocation | null> {
  // Normalize: the index stores the bracketed form (`<...@...>`); accept either.
  const trimmed = rfcMessageId.trim();
  const bracketed = /^<.*>$/.test(trimmed) ? trimmed : `<${trimmed.replace(/^<|>$/g, "")}>`;

  const cached = cache.get(bracketed);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const dbPath = await locateEnvelopeIndex();
  // sqlite3 CLI doesn't expose bound params; escape single quotes.
  const escaped = bracketed.replace(/'/g, "''");
  const sql = `
    SELECT mb.url AS url
    FROM messages m
    JOIN message_global_data mgd ON mgd.ROWID = m.global_message_id
    JOIN mailboxes mb ON mb.ROWID = m.mailbox
    WHERE mgd.message_id_header = '${escaped}' AND m.deleted = 0
    LIMIT 1;
  `;
  const rows = await querySqlite<{ url: string }>(dbPath, sql);

  let value: MessageLocation | null = null;
  if (rows[0]) {
    const parsed = parseMailboxUrl(rows[0].url);
    if (parsed) {
      value = { ...parsed, mailboxUrl: rows[0].url };
    }
  }

  cache.set(bracketed, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/** Test-only — clear the lookup cache between tests. */
export function __clearLocationCache(): void {
  cache.clear();
}
