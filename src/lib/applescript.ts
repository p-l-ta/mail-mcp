import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileP = promisify(execFile);

export interface RunAppleScriptOptions {
  /** AppleScript body. Variables in `args` are bound as locals before this runs. */
  script: string;
  /** Named string arguments. Bound as `set <name> to item N of argv` so the script avoids any string interpolation. */
  args?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Write a full AppleScript to a temp file and run it via osascript.
 * String values are passed through `argv` rather than interpolated, so
 * quotes and newlines in user input cannot break out of the script.
 */
export async function runAppleScript(opts: RunAppleScriptOptions): Promise<string> {
  const { script, args = {}, timeoutMs = 30_000 } = opts;

  const argNames = Object.keys(args);
  const argValues = argNames.map((n) => args[n]!);

  const bindings = argNames
    .map((name, i) => `  set ${name} to item ${i + 1} of argv`)
    .join("\n");

  const wrapped = `on run argv\n${bindings}\n${script}\nend run\n`;

  const dir = await mkdtemp(path.join(tmpdir(), "mail-mcp-"));
  const scriptPath = path.join(dir, "script.applescript");
  try {
    await writeFile(scriptPath, wrapped, "utf8");
    const { stdout } = await execFileP("osascript", [scriptPath, ...argValues], {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trimEnd();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
