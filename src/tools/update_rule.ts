import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readRules,
  writeRules,
  notifyMailRulesChanged,
  newRuleId,
  nowTimestamp,
  type RuleCriterion,
} from "../lib/rules.js";

const CriterionSchema = z.object({
  header: z.string(),
  qualifier: z
    .enum([
      "Contains",
      "DoesNotContain",
      "BeginsWith",
      "EndsWith",
      "IsEqualTo",
      "IsNotEqualTo",
    ])
    .optional(),
  expression: z.string().optional(),
});

const ActionsUpdateSchema = z.object({
  move_to_mailbox_url: z.string().nullable().optional(),
  copy_to_mailbox_url: z.string().nullable().optional(),
  mark_read: z.boolean().optional(),
  mark_flagged: z.boolean().optional(),
  delete_message: z.boolean().optional(),
  run_script: z.string().nullable().optional(),
  stop_evaluating_rules: z.boolean().optional(),
});

const schema = {
  rule_id: z.string().describe("The RuleId of the rule to update (from list_rules)."),
  name: z.string().optional().describe("New display name."),
  match_all: z.boolean().optional().describe("true = ALL (AND); false = ANY (OR)."),
  conditions: z
    .array(CriterionSchema)
    .optional()
    .describe("Replace the full conditions list. Omit to leave unchanged."),
  actions: ActionsUpdateSchema.optional().describe(
    "Partial actions update — only supplied fields are changed.",
  ),
};

export function register(server: McpServer): void {
  server.tool(
    "update_rule",
    "Update an existing Mail.app rule by its RuleId (use list_rules to find IDs). A timestamped backup is made before writing. Mail.app may need to be restarted for changes to take effect.",
    schema,
    { title: "Update Rule", readOnlyHint: false, destructiveHint: false },
    async ({ rule_id, name, match_all, conditions, actions }) => {
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

      const rule = { ...rules[idx]! };

      if (name !== undefined) rule.RuleName = name;
      if (match_all !== undefined) rule.AllCriteriaMustBeSatisfied = match_all;

      if (conditions !== undefined) {
        rule.Criteria = conditions.map(
          (c: z.infer<typeof CriterionSchema>): RuleCriterion => ({
            CriterionUniqueId: newRuleId(),
            Header: c.header,
            ...(c.qualifier ? { Qualifier: c.qualifier } : {}),
            ...(c.expression !== undefined ? { Expression: c.expression } : {}),
          }),
        );
      }

      if (actions !== undefined) {
        if (actions.move_to_mailbox_url !== undefined) {
          rule.ShouldTransferMessage = actions.move_to_mailbox_url !== null;
          if (actions.move_to_mailbox_url !== null) {
            rule.MailboxURL = actions.move_to_mailbox_url;
          } else {
            delete rule.MailboxURL;
          }
        }
        if (actions.copy_to_mailbox_url !== undefined) {
          rule.ShouldCopyMessage = actions.copy_to_mailbox_url !== null;
          if (actions.copy_to_mailbox_url !== null) {
            rule.CopyToMailboxURL = actions.copy_to_mailbox_url;
          } else {
            delete rule.CopyToMailboxURL;
          }
        }
        if (actions.mark_read !== undefined) rule.MarkRead = actions.mark_read;
        if (actions.mark_flagged !== undefined) rule.MarkFlagged = actions.mark_flagged;
        if (actions.delete_message !== undefined) rule.Deletes = actions.delete_message;
        if (actions.run_script !== undefined) {
          if (actions.run_script !== null) {
            rule.AppleScript = actions.run_script;
          } else {
            delete rule.AppleScript;
          }
        }
        if (actions.stop_evaluating_rules !== undefined) {
          rule.StopEvaluatingRules = actions.stop_evaluating_rules;
        }
      }

      rule.TimeStamp = nowTimestamp();
      rules[idx] = rule;

      const { backupPath } = await writeRules(rules);
      const mailRunning = await notifyMailRulesChanged();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                updated: { id: rule.RuleId, name: rule.RuleName },
                backup: backupPath,
                note: mailRunning
                  ? "Mail.app is running — quit and reopen Mail for changes to take effect."
                  : "Mail.app is not running — changes will be active on next launch.",
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
