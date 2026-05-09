import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:child_process so plutil / osascript never actually run
// ---------------------------------------------------------------------------
const execFileMock = vi.fn();
vi.mock("node:child_process", () => {
  const execFile = (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "", "");
  (execFile as unknown as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[], opts: unknown) => {
    execFileMock(cmd, args, opts);
    return Promise.resolve({ stdout: execFileMock._stdout ?? "", stderr: "" });
  };
  return { execFile };
});

// Mock fs/promises so backup/write never touch disk
vi.mock("node:fs/promises", () => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(""),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/fake-dir"),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue(["V10"]),
}));

const { newRuleId, nowTimestamp } = await import("../lib/rules.js");

describe("newRuleId", () => {
  it("returns an uppercase UUID string", () => {
    const id = newRuleId();
    expect(id).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
  });

  it("returns unique values on each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newRuleId()));
    expect(ids.size).toBe(20);
  });
});

describe("nowTimestamp", () => {
  it("returns a number near the expected Mac absolute time", () => {
    const MAC_EPOCH_OFFSET = 978307200;
    const ts = nowTimestamp();
    const expected = Math.floor(Date.now() / 1000) - MAC_EPOCH_OFFSET;
    expect(ts).toBeGreaterThanOrEqual(expected - 2);
    expect(ts).toBeLessThanOrEqual(expected + 2);
  });

  it("returns a positive integer", () => {
    expect(nowTimestamp()).toBeGreaterThan(0);
    expect(Number.isInteger(nowTimestamp())).toBe(true);
  });
});
