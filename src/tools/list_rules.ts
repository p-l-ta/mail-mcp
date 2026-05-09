import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readRules } from "../lib/rules.js";

export function register(server: McpServer): void {
  server.tool(
    "list_rules",
    "List all Mail.app rules with their conditions and actions. Reads directly from SyncedRules.plist.",
    {},
    { title: "List Rules", readOnlyHint: true, destructiveHint: false },
    async () => {
      const rules = await readRules();
      const summary = rules.map((r) => ({
        id: r.RuleId,
        name: r.RuleName,
        enabled: r.StopEvaluatingRules !== undefined ? true : true, // all rules are always listed
        match: r.AllCriteriaMustBeSatisfied ? "ALL" : "ANY",
        conditions: r.Criteria.map((c) => ({
          header: c.Header,
          qualifier: c.Qualifier ?? null,
          expression: c.Expression ?? null,
        })),
        actions: {
          move_to: r.ShouldTransferMessage ? (r.MailboxURL ?? null) : null,
          copy_to: r.ShouldCopyMessage ? (r.CopyToMailboxURL ?? null) : null,
          mark_read: r.MarkRead,
          mark_flagged: r.MarkFlagged,
          delete: r.Deletes,
          highlight_color: r.HighlightTextUsingColor ? (r.Color ?? null) : null,
          run_script: r.AppleScript ?? null,
          stop_evaluating: r.StopEvaluatingRules ?? false,
        },
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );
}
