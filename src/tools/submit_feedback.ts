import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getMacosVersion, getPackageVersion } from "../lib/state.js";

const execFileP = promisify(execFile);

const REPO = "p-l-ta/mail-mcp";

const schema = {
  title: z.string().optional().describe("Short issue title (optional — a default will be generated)."),
  description: z
    .string()
    .describe(
      "Description of the problem or feedback. Include steps to reproduce if reporting a bug.",
    ),
};

export function register(server: McpServer): void {
  server.tool(
    "submit_feedback",
    `Open a pre-filled GitHub issue for mail-mcp (${REPO}) in the default browser. Automatically includes macOS version and mail-mcp version in the issue body.`,
    schema,
    { title: "Submit Feedback", readOnlyHint: false, destructiveHint: false },
    async ({ title, description }) => {
      const [macosVersion, pkgVersion] = await Promise.all([getMacosVersion(), getPackageVersion()]);

      const issueTitle = title ?? `[Feedback] ${description.slice(0, 60)}${description.length > 60 ? "…" : ""}`;

      const body = [
        description,
        "",
        "---",
        `**mail-mcp version:** ${pkgVersion}`,
        `**macOS version:** ${macosVersion}`,
      ].join("\n");

      const url = new URL(`https://github.com/${REPO}/issues/new`);
      url.searchParams.set("title", issueTitle);
      url.searchParams.set("body", body);

      try {
        await execFileP("open", [url.toString()]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "opened",
                  url: url.toString(),
                  note: "A pre-filled GitHub issue has been opened in your browser. Review and submit it there.",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        // Fallback: return the URL so the user can open it manually
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  error: msg,
                  url: url.toString(),
                  note: "Could not open browser automatically. Copy the URL above and open it manually.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
