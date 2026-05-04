import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

/**
 * Locate Mail.app's "Envelope Index" SQLite database.
 * Modern macOS uses ~/Library/Mail/V10/MailData/Envelope Index.
 * We scan ~/Library/Mail for the highest V<N> directory in case Apple bumps it.
 */
export async function locateEnvelopeIndex(): Promise<string> {
  const mailDir = path.join(homedir(), "Library", "Mail");
  const entries = await readdir(mailDir);
  const versions = entries
    .filter((e) => /^V\d+$/.test(e))
    .map((e) => ({ name: e, n: parseInt(e.slice(1), 10) }))
    .sort((a, b) => b.n - a.n);
  if (versions.length === 0) {
    throw new Error(`No V<N> directory found in ${mailDir}`);
  }
  return path.join(mailDir, versions[0]!.name, "MailData", "Envelope Index");
}

/** Escape a SQL string literal (sqlite3 CLI doesn't expose bound params). */
function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Run a SELECT against the Envelope Index. Read-only, JSON-mode output.
 * If the DB is being written to by Mail.app concurrently, SQLite WAL mode
 * still allows clean reads.
 */
export async function querySqlite<T = unknown>(
  dbPath: string,
  sql: string,
): Promise<T[]> {
  const { stdout } = await execFileP(
    "/usr/bin/sqlite3",
    ["-readonly", "-json", dbPath, sql],
    { maxBuffer: 50 * 1024 * 1024 },
  );
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed) as T[];
}

export interface SearchFilters {
  /** Free-text — matches subject, sender address/name, body summary. */
  query?: string;
  /** Substring match on sender address or display name. */
  from?: string;
  /** Substring match on subject. */
  subject?: string;
  /** ISO date — only messages received on or after this date. */
  since?: string;
  /** Restrict to a specific account name (matches mailbox URL host hint). */
  account?: string;
  limit: number;
  /** Include deleted/trashed messages. Default false. */
  include_deleted?: boolean;
}

export interface SearchHit {
  rowid: number;
  messageId: string | null;
  remoteId: number | null;
  subject: string;
  fromAddress: string | null;
  fromName: string | null;
  dateReceived: string;
  /** Body snippet from Mail's own summaries table. */
  snippet: string | null;
  read: boolean;
  flagged: boolean;
  deleted: boolean;
  size: number;
  mailboxUrl: string;
  /** Best-effort mailbox label parsed from the IMAP/EWS URL. */
  mailboxName: string | null;
}

interface RawRow {
  rowid: number;
  message_id_text: string | null;
  remote_id: number | null;
  subject_prefix: string | null;
  subject_text: string | null;
  sender_address: string | null;
  sender_comment: string | null;
  date_received: number | null;
  summary_text: string | null;
  read: number;
  flagged: number;
  deleted: number;
  size: number;
  mailbox_url: string;
}

function parseMailboxName(url: string): string | null {
  // imap://user%40example.com@mail.example.com:993/INBOX
  // ews://...                    (Exchange)
  // pop://...                    (POP)
  // file:///...                  (Local On-My-Mac)
  try {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    if (p) return p;
    return u.hostname || null;
  } catch {
    return null;
  }
}

export function buildSearchSql(filters: SearchFilters): string {
  const where: string[] = [];

  if (!filters.include_deleted) where.push("m.deleted = 0");

  if (filters.query) {
    const q = `'%${sqlEscape(filters.query)}%'`;
    where.push(
      `(s.subject LIKE ${q} ` +
        `OR a.address LIKE ${q} ` +
        `OR a.comment LIKE ${q} ` +
        `OR sm.summary LIKE ${q})`,
    );
  }
  if (filters.subject) {
    where.push(`s.subject LIKE '%${sqlEscape(filters.subject)}%'`);
  }
  if (filters.from) {
    const f = `'%${sqlEscape(filters.from)}%'`;
    where.push(`(a.address LIKE ${f} OR a.comment LIKE ${f})`);
  }
  if (filters.since) {
    const since = Math.floor(new Date(filters.since).getTime() / 1000);
    if (Number.isFinite(since)) {
      where.push(`m.date_received >= ${since}`);
    }
  }
  if (filters.account) {
    where.push(`mb.url LIKE '%${sqlEscape(filters.account)}%'`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Use a CTE to look up the global RFC message-id from message_global_data.
  return `
    SELECT
      m.ROWID                                  AS rowid,
      mgd.message_id_header                    AS message_id_text,
      m.remote_id                              AS remote_id,
      m.subject_prefix                         AS subject_prefix,
      s.subject                                AS subject_text,
      a.address                                AS sender_address,
      a.comment                                AS sender_comment,
      m.date_received                          AS date_received,
      sm.summary                               AS summary_text,
      m.read                                   AS read,
      m.flagged                                AS flagged,
      m.deleted                                AS deleted,
      m.size                                   AS size,
      mb.url                                   AS mailbox_url
    FROM messages m
    LEFT JOIN subjects s        ON s.ROWID = m.subject
    LEFT JOIN addresses a       ON a.ROWID = m.sender
    LEFT JOIN summaries sm      ON sm.ROWID = m.summary
    LEFT JOIN mailboxes mb      ON mb.ROWID = m.mailbox
    LEFT JOIN message_global_data mgd ON mgd.ROWID = m.global_message_id
    ${whereClause}
    ORDER BY m.date_received DESC
    LIMIT ${Math.max(1, Math.floor(filters.limit))};
  `;
}

export function rowToHit(r: RawRow): SearchHit {
  return {
    rowid: r.rowid,
    messageId: r.message_id_text,
    remoteId: r.remote_id,
    subject: `${r.subject_prefix ?? ""}${r.subject_text ?? ""}`,
    fromAddress: r.sender_address,
    fromName: r.sender_comment || null,
    dateReceived: r.date_received
      ? new Date(r.date_received * 1000).toISOString()
      : "",
    snippet: r.summary_text
      ? r.summary_text.replace(/\s+/g, " ").trim().slice(0, 300)
      : null,
    read: r.read !== 0,
    flagged: r.flagged !== 0,
    deleted: r.deleted !== 0,
    size: r.size,
    mailboxUrl: r.mailbox_url,
    mailboxName: parseMailboxName(r.mailbox_url),
  };
}

export async function searchMessages(filters: SearchFilters): Promise<SearchHit[]> {
  const dbPath = await locateEnvelopeIndex();
  const sql = buildSearchSql(filters);
  const rows = await querySqlite<RawRow>(dbPath, sql);
  return rows.map(rowToHit);
}
