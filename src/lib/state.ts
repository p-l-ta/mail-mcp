/**
 * Persistent state for mail-mcp across sessions.
 *
 * Stored at ~/.config/mail-mcp/state.json. Used to detect macOS version
 * changes between sessions so the user can be prompted to run
 * check_compatibility when the OS has been updated.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

export interface MailMcpState {
  /** macOS version string at last run, e.g. "15.4.1" */
  macosVersion: string;
  /** mail-mcp package version at last run, e.g. "1.2.0" */
  mailMcpVersion: string;
  /** ISO timestamp of last state write */
  lastChecked: string;
}

function statePath(): string {
  return path.join(homedir(), ".config", "mail-mcp", "state.json");
}

/** Read current macOS version via sw_vers. */
export async function getMacosVersion(): Promise<string> {
  try {
    const { stdout } = await execFileP("sw_vers", ["-productVersion"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

/** Read the mail-mcp package version from package.json. */
export async function getPackageVersion(): Promise<string> {
  try {
    // Walk up from __dirname to find package.json
    const pkgPath = path.join(new URL(".", import.meta.url).pathname, "..", "..", "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Read saved state. Returns null if no state file exists yet. */
export async function readState(): Promise<MailMcpState | null> {
  try {
    const raw = await readFile(statePath(), "utf8");
    return JSON.parse(raw) as MailMcpState;
  } catch {
    return null;
  }
}

/** Write state to disk, creating the directory if needed. */
export async function writeState(state: MailMcpState): Promise<void> {
  const dir = path.dirname(statePath());
  await mkdir(dir, { recursive: true });
  await writeFile(statePath(), JSON.stringify(state, null, 2), "utf8");
}

/**
 * Compare the current macOS version against the stored one.
 *
 * - On first run: saves state, returns null.
 * - If version matches: updates lastChecked, returns null.
 * - If version changed: updates state, returns a warning string.
 */
export async function checkVersionChange(): Promise<string | null> {
  const [current, pkgVersion, saved] = await Promise.all([
    getMacosVersion(),
    getPackageVersion(),
    readState(),
  ]);

  const newState: MailMcpState = {
    macosVersion: current,
    mailMcpVersion: pkgVersion,
    lastChecked: new Date().toISOString(),
  };

  // Always update state (refresh lastChecked)
  await writeState(newState).catch(() => {}); // non-fatal

  if (!saved) return null; // first run — no comparison to make
  if (saved.macosVersion === current) return null; // no change

  return (
    `macOS version changed from ${saved.macosVersion} to ${current}. ` +
    `Some mail-mcp internals (Envelope Index schema, SyncedRules.plist format, ` +
    `MailData directory) may have changed. Run the check_compatibility tool to verify.`
  );
}
