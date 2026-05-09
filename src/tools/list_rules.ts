import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readRules } from "../lib/rules.js";

// ---------------------------------------------------------------------------
// Color lookup tables
//
// Mail.app stores colors as integers. Two distinct actions use different
// integer palettes for the same color name:
//   - "Set Color of text"  → HighlightTextUsingColor: true
//   - "Set Color" (message row) → HighlightTextUsingColor: false, Color set
// ---------------------------------------------------------------------------
const TEXT_HIGHLIGHT_COLORS: Record<number, string> = {
  3503295: "blue",
  6977676: "gray",
  8674197: "purple",
  9485826: "green",
  14134016: "yellow",
  14819865: "red",
  // orange: not yet observed in plist — add when encountered
};

const MESSAGE_ROW_COLORS: Record<number, string> = {
  9158119: "none",
  13235369: "green",
  14136549: "purple",
  16750738: "red",
  16763531: "orange",
  // yellow, blue, gray: not yet observed in plist — add when encountered
};

function resolveColor(
  highlightText: boolean,
  colorValue: number | undefined,
): { type: "text" | "message" | null; name: string | null; value: number | null } {
  if (colorValue === undefined) return { type: null, name: null, value: null };
  if (highlightText) {
    const name = TEXT_HIGHLIGHT_COLORS[colorValue] ?? null;
    return { type: "text", name, value: colorValue };
  }
  const name = MESSAGE_ROW_COLORS[colorValue];
  if (name === undefined) return { type: null, name: null, value: null };
  if (name === "none") return { type: null, name: null, value: null };
  return { type: "message", name, value: colorValue };
}

// Headers that never carry a Qualifier in the plist — Mail treats them as
// boolean matches (present or not) rather than string comparisons.
const BOOLEAN_HEADERS = new Set(["IsJunkMail", "SenderIsNotInAddressBook", "Account"]);

// When a standard string-comparison header has no Qualifier key in the plist,
// Mail defaults to "Contains".
function resolveQualifier(header: string, qualifier: string | undefined): string | null {
  if (qualifier) return qualifier;
  if (BOOLEAN_HEADERS.has(header)) return null;
  return "Contains";
}

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
        match: r.AllCriteriaMustBeSatisfied ? "ALL" : "ANY",
        conditions: (r.Criteria ?? []).map((c) => ({
          header: c.Header,
          qualifier: resolveQualifier(c.Header, c.Qualifier),
          expression: c.Expression ?? null,
        })),
        actions: {
          move_to: r.ShouldTransferMessage ? (r.MailboxURL ?? null) : null,
          copy_to: r.ShouldCopyMessage ? (r.CopyToMailboxURL ?? null) : null,
          mark_read: r.MarkRead,
          mark_flagged: r.MarkFlagged,
          delete: r.Deletes,
          color: resolveColor(r.HighlightTextUsingColor, r.Color),
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
