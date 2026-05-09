import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Rule } from "../lib/rules.js";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------
let mockRules: Rule[] = [];
const writtenRules: Rule[][] = [];

vi.mock("../lib/rules.js", () => ({
  readRules: vi.fn(async () => structuredClone(mockRules)),
  writeRules: vi.fn(async (rules: Rule[]) => {
    writtenRules.push(structuredClone(rules));
    return { backupPath: "/fake/backup.plist" };
  }),
  notifyMailRulesChanged: vi.fn(async () => false),
  deleteRuleFromMail: vi.fn(async () => {}),
  upsertRuleInMail: vi.fn(async () => {}),
  newRuleId: vi.fn(() => "GENERATED-UUID"),
  nowTimestamp: vi.fn(() => 700000000),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    RuleId: "RULE-1",
    RuleName: "Test Rule",
    AllCriteriaMustBeSatisfied: true,
    Criteria: [{ CriterionUniqueId: "C1", Header: "From", Qualifier: "Contains", Expression: "foo@bar.com" }],
    ShouldTransferMessage: false,
    ShouldCopyMessage: false,
    MarkRead: false,
    MarkFlagged: false,
    Deletes: false,
    HighlightTextUsingColor: false,
    NotifyUser: false,
    SendNotification: false,
    AutoResponseType: 0,
    TimeStamp: 700000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MCP server stub — captures registered tools so we can call handlers directly
// ---------------------------------------------------------------------------
type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
const tools: Record<string, Handler> = {};
const fakeServer = {
  tool: (_name: string, _desc: string, _schema: unknown, _hints: unknown, handler: Handler) => {
    tools[_name] = handler;
  },
};

// Register all three tools
const { register: registerCreate } = await import("../tools/create_rule.js");
const { register: registerUpdate } = await import("../tools/update_rule.js");
const { register: registerDelete } = await import("../tools/delete_rule.js");
registerCreate(fakeServer as never);
registerUpdate(fakeServer as never);
registerDelete(fakeServer as never);

// ---------------------------------------------------------------------------
// create_rule
// ---------------------------------------------------------------------------
describe("create_rule tool", () => {
  beforeEach(() => {
    mockRules = [];
    writtenRules.length = 0;
  });

  it("appends a new rule and returns its id and name", async () => {
    const result = await tools["create_rule"]!({
      name: "My Rule",
      match_all: true,
      conditions: [{ header: "From", qualifier: "Contains", expression: "test@example.com" }],
      actions: { mark_read: false, mark_flagged: false, delete_message: false, stop_evaluating_rules: false },
    });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.created.name).toBe("My Rule");
    expect(writtenRules).toHaveLength(1);
    expect(writtenRules[0]).toHaveLength(1);
    expect(writtenRules[0]![0]!.RuleName).toBe("My Rule");
    expect(writtenRules[0]![0]!.MarkRead).toBe(false);
  });

  it("sets move_to when move_to_mailbox_url is provided", async () => {
    await tools["create_rule"]!({
      name: "Move Rule",
      match_all: false,
      conditions: [{ header: "Subject", qualifier: "Contains", expression: "hello" }],
      actions: {
        move_to_mailbox_url: "imap://user@host/INBOX/Test",
        mark_read: true,
        mark_flagged: false,
        delete_message: false,
        stop_evaluating_rules: false,
      },
    });
    const written = writtenRules[0]![0]!;
    expect(written.ShouldTransferMessage).toBe(true);
    expect(written.MailboxURL).toBe("imap://user@host/INBOX/Test");
    expect(written.MarkRead).toBe(true);
  });

  it("stores criteria correctly", async () => {
    await tools["create_rule"]!({
      name: "Multi Cond",
      match_all: false,
      conditions: [
        { header: "From", qualifier: "Contains", expression: "a@b.com" },
        { header: "Subject", qualifier: "BeginsWith", expression: "[ALERT]" },
      ],
      actions: { mark_read: false, mark_flagged: false, delete_message: false, stop_evaluating_rules: false },
    });
    const criteria = writtenRules[0]![0]!.Criteria;
    expect(criteria).toHaveLength(2);
    expect(criteria[0]!.Header).toBe("From");
    expect(criteria[1]!.Qualifier).toBe("BeginsWith");
  });
});

// ---------------------------------------------------------------------------
// delete_rule
// ---------------------------------------------------------------------------
describe("delete_rule tool", () => {
  beforeEach(() => {
    mockRules = [makeRule({ RuleId: "RULE-1", RuleName: "Keep Me" }), makeRule({ RuleId: "RULE-2", RuleName: "Delete Me" })];
    writtenRules.length = 0;
  });

  it("removes the specified rule and writes the remainder", async () => {
    const result = await tools["delete_rule"]!({ rule_id: "RULE-2" });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.deleted.name).toBe("Delete Me");
    expect(writtenRules[0]).toHaveLength(1);
    expect(writtenRules[0]![0]!.RuleName).toBe("Keep Me");
  });

  it("returns an error message when the rule is not found", async () => {
    const result = await tools["delete_rule"]!({ rule_id: "NO-SUCH-ID" });
    expect(result.content[0]!.text).toContain("Rule not found");
    expect(writtenRules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// update_rule
// ---------------------------------------------------------------------------
describe("update_rule tool", () => {
  beforeEach(() => {
    mockRules = [makeRule({ RuleId: "RULE-1", RuleName: "Original Name", MarkRead: false })];
    writtenRules.length = 0;
  });

  it("renames the rule when name is provided", async () => {
    await tools["update_rule"]!({ rule_id: "RULE-1", name: "New Name" });
    expect(writtenRules[0]![0]!.RuleName).toBe("New Name");
  });

  it("updates actions when actions are provided", async () => {
    await tools["update_rule"]!({ rule_id: "RULE-1", actions: { mark_read: true } });
    expect(writtenRules[0]![0]!.MarkRead).toBe(true);
  });

  it("replaces criteria when conditions are provided", async () => {
    await tools["update_rule"]!({
      rule_id: "RULE-1",
      conditions: [{ header: "To", qualifier: "Contains", expression: "me@example.com" }],
    });
    const criteria = writtenRules[0]![0]!.Criteria;
    expect(criteria).toHaveLength(1);
    expect(criteria[0]!.Header).toBe("To");
  });

  it("clears move_to when null is passed", async () => {
    mockRules = [makeRule({ RuleId: "RULE-1", ShouldTransferMessage: true, MailboxURL: "imap://x/y" })];
    await tools["update_rule"]!({ rule_id: "RULE-1", actions: { move_to_mailbox_url: null } });
    const written = writtenRules[0]![0]!;
    expect(written.ShouldTransferMessage).toBe(false);
    expect(written.MailboxURL).toBeUndefined();
  });

  it("returns an error message when the rule is not found", async () => {
    const result = await tools["update_rule"]!({ rule_id: "BOGUS", name: "x" });
    expect(result.content[0]!.text).toContain("Rule not found");
    expect(writtenRules).toHaveLength(0);
  });
});
