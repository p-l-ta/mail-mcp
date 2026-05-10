import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { getMacosVersion, getPackageVersion, readState } from "../lib/state.js";
import { runAppleScript } from "../lib/applescript.js";

const execFileP = promisify(execFile);

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Individual probes
// ---------------------------------------------------------------------------

async function checkMacosVersion(): Promise<CheckResult> {
  const version = await getMacosVersion();
  const [major] = version.split(".").map(Number);
  const pass = typeof major === "number" && major >= 13; // Ventura+
  return {
    name: "macOS version",
    pass,
    detail: `${version}${pass ? "" : " — mail-mcp requires macOS 13 (Ventura) or later"}`,
  };
}

async function checkMailDataDir(): Promise<CheckResult> {
  const mailDir = path.join(homedir(), "Library", "Mail");
  try {
    const { stdout } = await execFileP("ls", [mailDir]);
    const versions = stdout
      .trim()
      .split("\n")
      .filter((e) => /^V\d+$/.test(e))
      .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
    if (!versions.length) {
      return { name: "Mail data directory", pass: false, detail: "No versioned directory (V10, etc.) found in ~/Library/Mail/" };
    }
    const latest = versions[0]!;
    const vNum = parseInt(latest.slice(1));
    return {
      name: "Mail data directory",
      pass: vNum >= 10,
      detail: `Found ${latest}${vNum < 10 ? " — expected V10 or later" : ""}`,
    };
  } catch {
    return { name: "Mail data directory", pass: false, detail: "Cannot read ~/Library/Mail/ — grant Full Disk Access to the host app" };
  }
}

async function checkSyncedRules(): Promise<CheckResult> {
  const mailDir = path.join(homedir(), "Library", "Mail");
  try {
    const { stdout: ls } = await execFileP("ls", [mailDir]);
    const versions = ls
      .trim()
      .split("\n")
      .filter((e) => /^V\d+$/.test(e))
      .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
    if (!versions.length) throw new Error("no versioned dir");

    const plistPath = path.join(mailDir, versions[0]!, "MailData", "SyncedRules.plist");
    const { stdout } = await execFileP("plutil", ["-convert", "json", "-o", "-", plistPath]);
    const rules = JSON.parse(stdout);
    if (!Array.isArray(rules)) throw new Error("root is not an array");
    const sample = rules[0];
    const hasExpectedKeys =
      !sample || ("RuleId" in sample && "RuleName" in sample && "Criteria" in sample);
    return {
      name: "SyncedRules.plist",
      pass: hasExpectedKeys,
      detail: hasExpectedKeys
        ? `Readable, ${rules.length} rule(s), schema looks correct`
        : "Readable but missing expected keys (RuleId/RuleName/Criteria) — schema may have changed",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: "SyncedRules.plist", pass: false, detail: `Not readable: ${msg}` };
  }
}

async function checkEnvelopeIndex(): Promise<CheckResult> {
  const mailDir = path.join(homedir(), "Library", "Mail");
  try {
    const { stdout: ls } = await execFileP("ls", [mailDir]);
    const versions = ls
      .trim()
      .split("\n")
      .filter((e) => /^V\d+$/.test(e))
      .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
    if (!versions.length) throw new Error("no versioned dir");

    const dbPath = path.join(mailDir, versions[0]!, "MailData", "Envelope Index");
    await access(dbPath); // throws if not accessible

    // Check expected tables exist
    const { stdout } = await execFileP("sqlite3", [dbPath, ".tables"]);
    const tables = stdout.trim().split(/\s+/);
    const required = ["messages", "mailboxes", "addresses"];
    const missing = required.filter((t) => !tables.includes(t));

    if (missing.length) {
      return {
        name: "Envelope Index",
        pass: false,
        detail: `Accessible but missing expected tables: ${missing.join(", ")} — schema may have changed`,
      };
    }
    return { name: "Envelope Index", pass: true, detail: "Accessible, expected tables present" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: "Envelope Index", pass: false, detail: `Not accessible: ${msg}` };
  }
}

async function checkAppleScript(): Promise<CheckResult> {
  try {
    const result = await runAppleScript({
      script: `
tell application "Mail"
  set acctCount to count of accounts
  set ruleCount to count of rules
  return "accounts=" & acctCount & ",rules=" & ruleCount
end tell`,
      timeoutMs: 10_000,
    });
    return { name: "AppleScript (Mail)", pass: true, detail: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      name: "AppleScript (Mail)",
      pass: false,
      detail: `Failed: ${msg} — check Automation permission for the host app → Mail`,
    };
  }
}

export const __test = {
  checkMacosVersion,
  checkMailDataDir,
  checkSyncedRules,
  checkEnvelopeIndex,
  checkAppleScript,
};

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function register(server: McpServer): void {
  server.tool(
    "check_compatibility",
    "Probe each mail-mcp dependency (Envelope Index schema, SyncedRules.plist, AppleScript, MailData directory) and report pass/fail. Run this after a macOS update to verify nothing broke.",
    {},
    { title: "Check Compatibility", readOnlyHint: true, destructiveHint: false },
    async () => {
      const [macosVersion, pkgVersion, state] = await Promise.all([
        getMacosVersion(),
        getPackageVersion(),
        readState(),
      ]);

      const checks = await Promise.all([
        checkMacosVersion(),
        checkMailDataDir(),
        checkSyncedRules(),
        checkEnvelopeIndex(),
        checkAppleScript(),
      ]);

      const allPass = checks.every((c) => c.pass);
      const osChanged =
        state && state.macosVersion !== macosVersion
          ? `⚠️  macOS changed from ${state.macosVersion} → ${macosVersion} since last run.`
          : null;

      const report = {
        overall: allPass ? "pass" : "fail",
        mailMcpVersion: pkgVersion,
        macosVersion,
        osVersionChanged: osChanged ?? false,
        checks: checks.map((c) => ({
          name: c.name,
          status: c.pass ? "pass" : "fail",
          detail: c.detail,
        })),
      };

      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    },
  );
}
