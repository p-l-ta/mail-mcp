import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readRules, writeRules, notifyMailRulesChanged } from "../lib/rules.js";

const schema = {
  rule_id: z.string().describe("The RuleId of the rule to delete (from list_rules)."),
};

export function register(server: McpServer): void {
  server.tool(
    "delete_rule",
    "Permanently delete a Mail.app rule by its RuleId. A timestamped backup of SyncedRules.plist is made before writing so the deletion can be undone. Mail.app may need to be restarted for the change to take effect.",
    schema,
    { title: "Delete Rule", readOnlyHint: false, destructiveHint: true },
    async ({ rule_id }) => {
      const rules = await readRules();
      const idx = rules.findIndex((r) => r.RuleId === rule_id);
      if (idx === -1) {
        return {
          content: [
            {
              type: "text",
              text: `Rule not found: ${rule_id}. Use list_rules to get valid IDs.`,
            },
          ],
        };
      }

      const deleted = rules[idx]!;
      const remaining = rules.filter((_, i) => i !== idx);
      const { backupPath } = await writeRules(remaining);
      const mailRunning = await notifyMailRulesChanged();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                deleted: { id: deleted.RuleId, name: deleted.RuleName },
                backup: backupPath,
                restore_command: `restoreRulesBackup("${backupPath}")`,
                note: mailRunning
                  ? "Mail.app is running — quit and reopen Mail for the change to take effect."
                  : "Mail.app is not running — change will be active on next launch.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
