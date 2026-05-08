#!/usr/bin/env node
// Build a Claude Desktop Extension (.dxt) for mail-mcp.
//
// Layout of the produced .dxt (a zip archive):
//   manifest.json
//   package.json
//   dist/          (compiled TS server)
//   node_modules/  (production dependencies only)
//
// Output: <project_root>/build/mail-mcp.dxt

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, rm, cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileP = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const buildDir = path.join(root, "build");
const stage = path.join(buildDir, "mail-mcp");
const dxtPath = path.join(buildDir, "mail-mcp.dxt");

async function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const { stdout, stderr } = await execFileP(cmd, args, { cwd: root, ...opts });
  if (stderr.trim()) process.stderr.write(stderr);
  return stdout;
}

console.log("Cleaning build dir...");
await rm(buildDir, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

console.log("Compiling TypeScript...");
await run("npm", ["run", "build"]);

console.log("Copying dist/ ...");
await cp(path.join(root, "dist"), path.join(stage, "dist"), { recursive: true });

console.log("Copying manifest.json + package.json ...");
await cp(path.join(root, "manifest.json"), path.join(stage, "manifest.json"));

// Strip devDependencies from the staged package.json so `npm install --omit=dev`
// produces only what the running server needs.
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
delete pkg.devDependencies;
delete pkg.scripts;
await writeFile(path.join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

console.log("Installing production dependencies in stage...");
await run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--silent"], {
  cwd: stage,
});

// npm leaves a package-lock.json in the stage; harmless but trim it.
await rm(path.join(stage, "package-lock.json"), { force: true });

console.log("Zipping into .dxt ...");
await rm(dxtPath, { force: true });
await run("zip", ["-rq", dxtPath, "."], { cwd: stage });

const { size } = await import("node:fs/promises").then((fs) => fs.stat(dxtPath));
console.log(`\n✓ Built ${path.relative(root, dxtPath)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log("\nInstall via Claude Desktop:");
console.log("  Settings → Extensions → Install... → select this .dxt");
console.log(`  ${dxtPath}`);
