import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readRules,
  writeRules,
  notifyMailRulesChanged,
  newRuleId,
  nowTimestamp,
  type Rule,
  type RuleCriterion,
} from "../lib/rules.js";

const CriterionSchema = z.object({
  header: z
    .string()
    .describe(
      'Field to test: "From", "To", "Subject", "Body", "Account", "IsJunkMail", "SenderIsNotInAddressBook", or any arbitrary header name.',
    ),
  qualifier: z
    .enum([
      "Contains",
      "DoesNotContain",
      "BeginsWith",
      "EndsWith",
      "IsEqualTo",
      "IsNotEqualTo",
    ])
    .optional()
    .describe("Omit for boolean headers like IsJunkMail."),
  expression: z.string().optional().describe("Value to match. Omit for boolean headers."),
});

const ActionsSchema = z.object({
  move_to_mailbox_url: z
    .string()
    .optional()
    .describe(
      'Move matched messages here. Use a mailbox URL from list_accounts_and_mailboxes, e.g. "imap://user@host/INBOX/Newsletter".',
    ),
  copy_to_mailbox_url: z.string().optional().describe("Copy matched messages here."),
  mark_read: z.boolean().default(false),
  mark_flagged: z.boolean().default(false),
  delete_message: z.boolean().default(false),
  run_script: z
    .string()
    .optional()
    .describe(
      "Name of an AppleScript file in ~/Library/Application Scripts/com.apple.mail/.",
    ),
  stop_evaluating_rules: z.boolean().default(false),
});

const schema = {
  name: z.string().describe("Display name for the rule."),
  match_all: z
    .boolean()
    .default(true)
    .describe("true = ALL conditions must match (AND); false = ANY (OR)."),
  conditions: z.array(CriterionSchema).min(1).describe("One or more match conditions."),
  actions: ActionsSchema.describe("At least one action should be set."),
};

export function register(server: McpServer): void {
  server.tool(
    "create_rule",
    "Create a new Mail.app rule. A timestamped backup of SyncedRules.plist is made before writing. Mail.app may need to be restarted for the rule to take effect.",
    schema,
    { title: "Create Rule", readOnlyHint: false, destructiveHint: false },
    async ({ name, match_all, conditions, actions }) => {
      const rules = await readRules();

      const criteria: RuleCriterion[] = conditions.map((c: z.infer<typeof CriterionSchema>) => ({
        CriterionUniqueId: newRuleId(),
        Header: c.header,
        ...(c.qualifier ? { Qualifier: c.qualifier } : {}),
        ...(c.expression !== undefined ? { Expression: c.expression } : {}),
      }));

      const newRule: Rule = {
        RuleId: newRuleId(),
        RuleName: name,
        AllCriteriaMustBeSatisfied: match_all,
        Criteria: criteria,
        ShouldTransferMessage: !!actions.move_to_mailbox_url,
        ...(actions.move_to_mailbox_url ? { MailboxURL: actions.move_to_mailbox_url } : {}),
        ShouldCopyMessage: !!actions.copy_to_mailbox_url,
        ...(actions.copy_to_mailbox_url
          ? { CopyToMailboxURL: actions.copy_to_mailbox_url }
          : {}),
        MarkRead: actions.mark_read,
        MarkFlagged: actions.mark_flagged,
        Deletes: actions.delete_message,
        HighlightTextUsingColor: false,
        NotifyUser: false,
        SendNotification: false,
        AutoResponseType: 0,
        ...(actions.run_script ? { AppleScript: actions.run_script } : {}),
        ...(actions.stop_evaluating_rules ? { StopEvaluatingRules: true } : {}),
        TimeStamp: nowTimestamp(),
      };

      rules.push(newRule);
      const { backupPath } = await writeRules(rules);
      const mailRunning = await notifyMailRulesChanged();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                created: { id: newRule.RuleId, name: newRule.RuleName },
                backup: backupPath,
                note: mailRunning
                  ? "Mail.app is running — quit and reopen Mail for the new rule to take effect."
                  : "Mail.app is not running — rule will be active on next launch.",
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
