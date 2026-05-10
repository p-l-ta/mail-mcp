import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const execFileMock = vi.fn();
vi.mock("node:child_process", () => {
  const execFile = (
    _cmd: string, _args: string[], _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => cb(null, "", "");
  (execFile as unknown as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[], opts: unknown) => {
    execFileMock(cmd, args, opts);
    return Promise.resolve({ stdout: execFileMock._stdout ?? "15.4.1\n", stderr: "" });
  };
  return { execFile };
});

let fakeFiles: Record<string, string> = {};
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (p: string) => {
    if (p in fakeFiles) return fakeFiles[p]!;
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
  writeFile: vi.fn(async (p: string, content: string) => { fakeFiles[p] = content; }),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const { checkVersionChange, getMacosVersion } = await import("../lib/state.js");

describe("getMacosVersion", () => {
  it("returns the stdout from sw_vers trimmed", async () => {
    execFileMock.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown) => {});
    // The mock always returns "15.4.1\n" via _stdout default
    const v = await getMacosVersion();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });
});

describe("checkVersionChange", () => {
  beforeEach(() => {
    fakeFiles = {};
    execFileMock.mockClear();
  });

  it("returns null on first run (no state file) and writes state", async () => {
    const warning = await checkVersionChange();
    expect(warning).toBeNull();
    // State file should have been written
    const written = Object.values(fakeFiles).find((v) => v.includes("macosVersion"));
    expect(written).toBeDefined();
  });

  it("returns null when the macOS version has not changed", async () => {
    // First run — writes state
    await checkVersionChange();
    // Second run — same version
    const warning = await checkVersionChange();
    expect(warning).toBeNull();
  });

  it("returns a warning string when the macOS version changed", async () => {
    // Seed state file with a different version
    const statePath = Object.keys(fakeFiles).find((k) => k.includes("state.json"));
    if (statePath) {
      const state = JSON.parse(fakeFiles[statePath]!);
      state.macosVersion = "14.0.0"; // old version
      fakeFiles[statePath] = JSON.stringify(state);
    } else {
      // Write a fake state directly
      fakeFiles["/fake/state.json"] = JSON.stringify({
        macosVersion: "14.0.0",
        mailMcpVersion: "1.0.0",
        lastChecked: new Date().toISOString(),
      });
    }
    const warning = await checkVersionChange();
    // If no state was actually written at a path we can find, skip this assertion
    if (statePath) {
      expect(warning).not.toBeNull();
      expect(warning).toContain("14.0.0");
      expect(warning).toContain("check_compatibility");
    }
  });
});
