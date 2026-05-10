import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// execFile mock — controls stdout for ls, plutil, sqlite3, sw_vers
const execFileMock = vi.fn();
vi.mock("node:child_process", () => {
  const execFile = (
    _cmd: string, _args: string[], _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "", "");
  (execFile as unknown as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[], opts: unknown) =>
    execFileMock(cmd, args, opts);
  return { execFile };
});

// fs/promises mock — access succeeds by default
const accessMock = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => '{"version":"1.0.0"}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: (...args: unknown[]) => accessMock(...args),
}));

// applescript mock
const runAppleScriptMock = vi.fn();
vi.mock("../lib/applescript.js", () => ({
  runAppleScript: (...args: unknown[]) => runAppleScriptMock(...args),
}));

// state mock (getMacosVersion is used by checkMacosVersion)
vi.mock("../lib/state.js", () => ({
  getMacosVersion: vi.fn().mockResolvedValue("15.4.1"),
  getPackageVersion: vi.fn().mockResolvedValue("1.0.0"),
  readState: vi.fn().mockResolvedValue(null),
  checkVersionChange: vi.fn().mockResolvedValue(null),
}));

const { __test } = await import("../tools/check_compatibility.js");
const { checkMacosVersion, checkMailDataDir, checkSyncedRules, checkEnvelopeIndex, checkAppleScript } = __test;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExecResult(stdout: string, stderr = "") {
  return Promise.resolve({ stdout, stderr });
}

beforeEach(() => {
  execFileMock.mockReset();
  accessMock.mockResolvedValue(undefined);
  runAppleScriptMock.mockReset();
});

// ---------------------------------------------------------------------------
// checkMacosVersion
// ---------------------------------------------------------------------------

describe("checkMacosVersion", () => {
  it("passes for macOS 15", async () => {
    // getMacosVersion is mocked to "15.4.1"
    const result = await checkMacosVersion();
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("15.4.1");
  });

  it("passes for macOS 13 (Ventura, minimum)", async () => {
    const { getMacosVersion } = await import("../lib/state.js");
    vi.mocked(getMacosVersion).mockResolvedValueOnce("13.0.0");
    const result = await checkMacosVersion();
    expect(result.pass).toBe(true);
  });

  it("fails for macOS 12 (Monterey)", async () => {
    const { getMacosVersion } = await import("../lib/state.js");
    vi.mocked(getMacosVersion).mockResolvedValueOnce("12.7.0");
    const result = await checkMacosVersion();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("macOS 13");
  });
});

// ---------------------------------------------------------------------------
// checkMailDataDir
// ---------------------------------------------------------------------------

describe("checkMailDataDir", () => {
  it("passes when V10 directory is present", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\nV9\nAccounts\n"));
    const result = await checkMailDataDir();
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("V10");
  });

  it("fails when only old versioned directories exist (V9)", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V9\nAccounts\n"));
    const result = await checkMailDataDir();
    expect(result.pass).toBe(false);
  });

  it("fails when no versioned directories exist", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("Accounts\nMailData\n"));
    const result = await checkMailDataDir();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("No versioned directory");
  });

  it("fails when ls throws (no FDA)", async () => {
    execFileMock.mockRejectedValueOnce(new Error("permission denied"));
    const result = await checkMailDataDir();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("Full Disk Access");
  });

  it("picks the highest version when multiple are present", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V8\nV10\nV11\n"));
    const result = await checkMailDataDir();
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("V11");
  });
});

// ---------------------------------------------------------------------------
// checkSyncedRules
// ---------------------------------------------------------------------------

describe("checkSyncedRules", () => {
  it("passes with a well-formed rules array", async () => {
    // ls for Mail dir
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    // plutil convert
    const rules = [{ RuleId: "abc", RuleName: "Test", Criteria: [] }];
    execFileMock.mockResolvedValueOnce(makeExecResult(JSON.stringify(rules)));
    const result = await checkSyncedRules();
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("1 rule");
  });

  it("passes when the rules array is empty", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    execFileMock.mockResolvedValueOnce(makeExecResult(JSON.stringify([])));
    const result = await checkSyncedRules();
    expect(result.pass).toBe(true);
  });

  it("fails when schema is missing expected keys", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    const rules = [{ SomethingElse: true }];
    execFileMock.mockResolvedValueOnce(makeExecResult(JSON.stringify(rules)));
    const result = await checkSyncedRules();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("missing expected keys");
  });

  it("fails when plutil returns non-array JSON", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    execFileMock.mockResolvedValueOnce(makeExecResult(JSON.stringify({ foo: "bar" })));
    const result = await checkSyncedRules();
    expect(result.pass).toBe(false);
  });

  it("fails when plutil throws", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    execFileMock.mockRejectedValueOnce(new Error("No such file"));
    const result = await checkSyncedRules();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("Not readable");
  });
});

// ---------------------------------------------------------------------------
// checkEnvelopeIndex
// ---------------------------------------------------------------------------

describe("checkEnvelopeIndex", () => {
  it("passes when all required tables are present", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    // sqlite3 .tables output
    execFileMock.mockResolvedValueOnce(
      makeExecResult("messages          mailboxes         addresses         properties\n"),
    );
    const result = await checkEnvelopeIndex();
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("expected tables present");
  });

  it("fails when a required table is missing", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    execFileMock.mockResolvedValueOnce(makeExecResult("messages          properties\n"));
    const result = await checkEnvelopeIndex();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("missing expected tables");
    expect(result.detail).toContain("mailboxes");
  });

  it("fails when access() throws (no FDA)", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("V10\n"));
    accessMock.mockRejectedValueOnce(Object.assign(new Error("EACCES"), { code: "EACCES" }));
    const result = await checkEnvelopeIndex();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("Not accessible");
  });

  it("fails when no versioned directory exists", async () => {
    execFileMock.mockResolvedValueOnce(makeExecResult("Accounts\n"));
    const result = await checkEnvelopeIndex();
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkAppleScript
// ---------------------------------------------------------------------------

describe("checkAppleScript", () => {
  it("passes when AppleScript round-trip succeeds", async () => {
    runAppleScriptMock.mockResolvedValueOnce("accounts=2,rules=5");
    const result = await checkAppleScript();
    expect(result.pass).toBe(true);
    expect(result.detail).toContain("accounts=2");
  });

  it("fails when AppleScript throws", async () => {
    runAppleScriptMock.mockRejectedValueOnce(new Error("Not allowed to send Apple events"));
    const result = await checkAppleScript();
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("Automation permission");
  });
});
