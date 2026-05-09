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
import { runAppleScript } from "./applescript.js";

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
// Mail in-memory sync
// ---------------------------------------------------------------------------

/** Returns true if Mail.app is currently running. */
export async function isMailRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileP("osascript", [
      "-e",
      'tell application "System Events" to (name of processes) contains "Mail"',
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * After writing to SyncedRules.plist, call this to sync the change into
 * Mail's in-memory state so Mail doesn't overwrite our plist edits when it
 * eventually quits.
 *
 * Returns true if Mail was running (sync attempted), false if not running
 * (plist write is sufficient — changes take effect on next launch).
 */
export async function notifyMailRulesChanged(): Promise<boolean> {
  return isMailRunning();
}

/**
 * Delete a rule from Mail's in-memory state by name.
 * Must be called AFTER writeRules() so the plist is already consistent.
 * No-op if Mail is not running.
 */
export async function deleteRuleFromMail(ruleName: string): Promise<void> {
  if (!(await isMailRunning())) return;
  await runAppleScript({
    script: `
tell application "Mail"
  repeat with i from (count of rules) to 1 by -1
    if name of rule i = targetName then
      delete rule i
      return "deleted"
    end if
  end repeat
  return "not_found"
end tell`,
    args: { targetName: ruleName },
  }).catch(() => {
    // Best-effort — don't fail the overall operation if AppleScript sync fails
  });
}

// Qualifier string → AppleScript constant token (used in rule condition scripts)
const QUALIFIER_AS: Record<string, string> = {
  Contains: "contains",
  DoesNotContain: "does not contain",
  BeginsWith: "begins with",
  EndsWith: "ends with",
  IsEqualTo: "is equal to",
  IsNotEqualTo: "is not equal to",
};

// Color integer → AppleScript color constant
const COLOR_INT_TO_AS: Record<number, string> = {
  3503295: "blue",
  6977676: "gray",
  8674197: "purple",
  9485826: "green",
  9158119: "none",
  13235369: "green",
  14134016: "yellow",
  14136549: "purple",
  14819865: "red",
  16750738: "red",
  16763531: "orange",
};

/**
 * Upsert a rule into Mail's in-memory state.
 *
 * Strategy:
 *   1. If a rule with `oldName` exists in Mail, delete it first (handles renames).
 *   2. Create a fresh rule with all settable properties and conditions.
 *   3. Attempt to resolve move_to / copy_to mailbox URLs to mailbox objects.
 *
 * This is best-effort — properties Mail's AppleScript dictionary doesn't
 * support (e.g. run_script file name) are silently skipped. The plist write
 * already has the authoritative values; this sync just prevents Mail from
 * clobbering them on quit.
 *
 * No-op if Mail is not running.
 */
export async function upsertRuleInMail(rule: Rule, oldName?: string): Promise<void> {
  if (!(await isMailRunning())) return;

  const colorAs = rule.Color !== undefined ? (COLOR_INT_TO_AS[rule.Color] ?? "none") : "none";
  const highlightText = rule.HighlightTextUsingColor ? "true" : "false";
  const markRead = rule.MarkRead ? "true" : "false";
  const markFlagged = rule.MarkFlagged ? "true" : "false";
  const deletes = rule.Deletes ? "true" : "false";
  const stopEval = rule.StopEvaluatingRules ? "true" : "false";
  const allCriteria = rule.AllCriteriaMustBeSatisfied ? "true" : "false";
  const shouldMove = rule.ShouldTransferMessage && rule.MailboxURL ? "true" : "false";
  const shouldCopy = rule.ShouldCopyMessage && rule.CopyToMailboxURL ? "true" : "false";
  const moveURL = rule.MailboxURL ?? "";
  const copyURL = rule.CopyToMailboxURL ?? "";

  // Build condition-setting block
  const conditionLines = (rule.Criteria ?? [])
    .map((c, i) => {
      const qualAs = c.Qualifier ? (QUALIFIER_AS[c.Qualifier] ?? "contains") : "contains";
      const expr = c.Expression ?? "";
      return `set cond${i} to make new rule condition of r with properties {header:${JSON.stringify(c.Header)}, qualifier:${qualAs}, expression:${JSON.stringify(expr)}}`;
    })
    .join("\n  ");

  const script = `
tell application "Mail"
  -- Remove old rule (handles renames and ensures clean state)
  set targetOld to oldRuleName
  if targetOld is not "" then
    repeat with i from (count of rules) to 1 by -1
      if name of rule i = targetOld then
        delete rule i
        exit repeat
      end if
    end repeat
  end if

  -- Create fresh rule
  set r to make new rule with properties {name:ruleName}
  set all conditions must be met of r to (allCriteria is "true")
  set mark read of r to (markRead is "true")
  set mark flagged of r to (markFlagged is "true")
  set delete message of r to (deletesMsg is "true")
  set highlight text using color of r to (highlightText is "true")
  set stop evaluating rules of r to (stopEval is "true")
  if colorAs is not "none" then
    set color message of r to colorAs as constant
  end if

  -- Conditions
  ${conditionLines}

  -- Mailbox move/copy (best-effort URL resolution)
  if shouldMove is "true" then
    set mboxFound to false
    repeat with acct in accounts
      repeat with mbox in mailboxes of acct
        if (url of mbox) is moveURL then
          set transfer mailbox of r to mbox
          set should transfer message of r to true
          set mboxFound to true
          exit repeat
        end if
      end repeat
      if mboxFound then exit repeat
    end repeat
  end if
  if shouldCopy is "true" then
    set mboxFound to false
    repeat with acct in accounts
      repeat with mbox in mailboxes of acct
        if (url of mbox) is copyURL then
          set copy mailbox of r to mbox
          set should copy message of r to true
          set mboxFound to true
          exit repeat
        end if
      end repeat
      if mboxFound then exit repeat
    end repeat
  end if

  return "ok"
end tell`;

  await runAppleScript({
    script,
    args: {
      oldRuleName: oldName ?? rule.RuleName,
      ruleName: rule.RuleName,
      allCriteria,
      markRead,
      markFlagged,
      deletesMsg: deletes,
      highlightText,
      stopEval,
      colorAs,
      shouldMove,
      moveURL,
      shouldCopy,
      copyURL,
    },
  }).catch(() => {
    // Best-effort — don't fail the overall operation if AppleScript sync fails
  });
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
