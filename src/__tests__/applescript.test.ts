import { describe, it, expect, vi, beforeEach } from "vitest";

const execFileMock = vi.fn();
vi.mock("node:child_process", () => {
  const execFile = (
    cmd: string,
    args: string[],
    opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    execFileMock(cmd, args, opts);
    cb(null, "ok\n", "");
  };
  // promisify(execFile) yields { stdout, stderr } when the custom symbol is set
  (execFile as unknown as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[], opts: unknown) => {
    execFileMock(cmd, args, opts);
    return Promise.resolve({ stdout: "ok\n", stderr: "" });
  };
  return { execFile };
});

const { runAppleScript } = await import("../lib/applescript.js");

describe("runAppleScript", () => {
  beforeEach(() => execFileMock.mockClear());

  it("invokes osascript with a temp script path and named args as argv", async () => {
    const out = await runAppleScript({
      script: 'return "hi"',
      args: { name: "Alice", body: 'has "quotes" and \nnewlines' },
    });
    expect(out).toBe("ok");
    expect(execFileMock).toHaveBeenCalledOnce();
    const [cmd, argv] = execFileMock.mock.calls[0]!;
    expect(cmd).toBe("osascript");
    expect(argv[0]).toMatch(/script\.applescript$/);
    expect(argv.slice(1)).toEqual(["Alice", 'has "quotes" and \nnewlines']);
  });

  it("works with no args", async () => {
    await runAppleScript({ script: 'return "ok"' });
    const [, argv] = execFileMock.mock.calls[0]!;
    expect(argv.length).toBe(1);
  });
});
