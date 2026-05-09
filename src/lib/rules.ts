/**
 * Read, write, and back up SyncedRules.plist from Mail's versioned MailData directory.
 *
 * The plist is XML; we round-trip via `plutil -convert json` so we never
 * have to generate XML by hand.  A timestamped backup is always written
 * before any modification — restore with restoreRulesBackup().
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, readFile, writeFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleCriterion {
  CriterionUniqueId: string;
  /** The field being tested: "From", "To", "Subject", "Body", "Account",
   *  "IsJunkMail", "SenderIsNotInAddressBook", arbitrary headers, etc. */
  Header: string;
  /** Comparison operator: "BeginsWith" | "EndsWith" | "Contains" |
   *  "DoesNotContain" | "IsEqualTo" | "IsNotEqualTo" — absent for
   *  boolean headers like IsJunkMail. */
  Qualifier?: string;
  /** The value to match — absent for boolean headers. */
  Expression?: string;
}

export interface Rule {
  RuleId: string;
  RuleName: string;
  /** If true ALL criteria must match (AND); false = any criterion matches (OR). */
  AllCriteriaMustBeSatisfied: boolean;
  Criteria: RuleCriterion[];
  // --- action fields ---
  ShouldTransferMessage: boolean;
  MailboxURL?: string;
  ShouldCopyMessage: boolean;
  CopyToMailboxURL?: string;
  MarkRead: boolean;
  MarkFlagged: boolean;
  /** Flag colour index (-1 = none). */
  MarkFlagIndex?: number;
  Deletes: boolean;
  HighlightTextUsingColor: boolean;
  /** Decimal colour integer (e.g. 16763531). */
  Color?: number;
  /** Name of a script in ~/Library/Application Scripts/com.apple.mail/. */
  AppleScript?: string;
  NotifyUser: boolean;
  SendNotification: boolean;
  AutoResponseType: number;
  StopEvaluatingRules?: boolean;
  TimeStamp: number;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Locate the versioned MailData directory (V10, V9, …). */
async function mailDataDir(): Promise<string> {
  const mailDir = path.join(homedir(), "Library", "Mail");
  // Prefer highest version number
  let entries: string[];
  try {
    entries = await readdir(mailDir);
  } catch {
    throw new Error(`Cannot read ${mailDir} — grant Full Disk Access to Claude Desktop.`);
  }
  const versioned = entries
    .filter((e) => /^V\d+$/.test(e))
    .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
  if (!versioned.length) throw new Error("No versioned Mail data directory found.");
  return path.join(mailDir, versioned[0]!, "MailData");
}

async function rulesPath(): Promise<string> {
  return path.join(await mailDataDir(), "SyncedRules.plist");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function readRules(): Promise<Rule[]> {
  const src = await rulesPath();
  const { stdout } = await execFileP("plutil", ["-convert", "json", "-o", "-", src]);
  return JSON.parse(stdout) as Rule[];
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/** Max number of backups to keep before pruning the oldest. */
const MAX_BACKUPS = 10;

/** Copy SyncedRules.plist to a timestamped .bak file.  Returns the backup path. */
export async function backupRules(): Promise<string> {
  const src = await rulesPath();
  const dir = path.dirname(src);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const dest = path.join(dir, `SyncedRules.plist.bak.${ts}`);
  await copyFile(src, dest);

  // Prune old backups
  try {
    const all = (await readdir(dir))
      .filter((e) => e.startsWith("SyncedRules.plist.bak."))
      .sort();
    if (all.length > MAX_BACKUPS) {
      const toDelete = all.slice(0, all.length - MAX_BACKUPS);
      await Promise.all(
        toDelete.map((f) =>
          rm(path.join(dir, f), { force: true }).catch(() => {}),
        ),
      );
    }
  } catch {
    // Pruning failure is non-fatal
  }

  return dest;
}

/** Restore a previously made backup. */
export async function restoreRulesBackup(backupPath: string): Promise<void> {
  const dest = await rulesPath();
  await copyFile(backupPath, dest);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Write rules back to SyncedRules.plist.
 * ALWAYS creates a backup first.  Returns the backup path.
 */
export async function writeRules(rules: Rule[]): Promise<{ backupPath: string }> {
  const dest = await rulesPath();
  const backupPath = await backupRules();

  // Write JSON to a temp file then convert to plist XML via plutil
  const dir = await mkdtemp(path.join(tmpdir(), "mail-mcp-rules-"));
  const tmpJson = path.join(dir, "rules.json");
  try {
    await writeFile(tmpJson, JSON.stringify(rules), "utf8");
    await execFileP("plutil", ["-convert", "xml1", "-o", dest, tmpJson]);
  } catch (err) {
    // Attempt to restore backup on write failure
    await restoreRulesBackup(backupPath).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  return { backupPath };
}

// ---------------------------------------------------------------------------
// Reload hint
// ---------------------------------------------------------------------------

/**
 * Ask Mail.app to reload rules by toggling its rules panel.
 * Mail doesn't expose a direct "reload rules" AppleScript command, so we
 * write the file and note that a restart may be needed for changes to take
 * effect in a running Mail.app session.
 *
 * Returns true if Mail was running (and may need a restart), false if it
 * was not running (changes take effect on next launch automatically).
 */
export async function notifyMailRulesChanged(): Promise<boolean> {
  try {
    const { stdout } = await execFileP("osascript", [
      "-e",
      'tell application "System Events" to (name of processes) contains "Mail"',
    ]);
    const running = stdout.trim() === "true";
    if (running) {
      // Best-effort: quit and reopen so Mail picks up the new rules file.
      // We do this gently — if the user has unsaved drafts this may interrupt
      // them, so we only do it if they explicitly want it.  For now just flag.
    }
    return running;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function newRuleId(): string {
  return crypto.randomUUID().toUpperCase();
}

export function nowTimestamp(): number {
  // Mac absolute time: seconds since 2001-01-01
  const MAC_EPOCH_OFFSET = 978307200;
  return Math.floor(Date.now() / 1000) - MAC_EPOCH_OFFSET;
}
