import { runAppleScript } from "./applescript.js";
import { locateMessage } from "./locate.js";

export interface FindAndActOptions {
  /** RFC message-id, with or without angle brackets. */
  messageId: string;
  /**
   * AppleScript snippet executed inside `tell application "Mail"`, after
   * the message has been bound to the local variable `foundMsg`. Must end
   * with a `return ...` statement that yields the result string.
   *
   * Available variables in scope: `foundMsg`, plus everything declared in
   * `extraArgs` (each becomes `set <name> to item N of argv` automatically).
   */
  action: string;
  /** Extra string args to pass through to the AppleScript runtime. */
  extraArgs?: Record<string, string>;
  timeoutMs?: number;
}

const NOT_FOUND_MARKER = "__MAILMCP_NOTFOUND__";

/**
 * Find a message by RFC message-id and execute an action against it.
 *
 * Strategy:
 *   1. Look up the message's mailbox via the Envelope Index. Targeted
 *      AppleScript navigates directly there (sub-second on any setup).
 *   2. If the index doesn't know about the message — or the targeted scan
 *      doesn't find it (race with new mail, etc.) — fall back to scanning
 *      every mailbox of every account.
 */
export async function findMessageAndAct(opts: FindAndActOptions): Promise<string> {
  const bareId = opts.messageId.replace(/^<|>$/g, "");
  const extraArgs = opts.extraArgs ?? {};

  const location = await locateMessage(opts.messageId);

  if (location) {
    const targetedScript = `
      tell application "Mail"
        set acctMatches to (every account whose user name is theUser)
        if (count of acctMatches) = 0 then return "${NOT_FOUND_MARKER}"
        set acct to item 1 of acctMatches
        try
          set mb to mailbox theMbox of acct
        on error
          return "${NOT_FOUND_MARKER}"
        end try
        set candidates to (messages of mb whose message id is theMsgId)
        if (count of candidates) = 0 then return "${NOT_FOUND_MARKER}"
        set foundMsg to item 1 of candidates
        ${opts.action}
      end tell
    `;
    const baseArgs: Record<string, string> = {
      theMsgId: bareId,
      theUser: location.userName,
      theMbox: location.mailboxPath,
    };
    const targetedRunArgs: { script: string; args: Record<string, string>; timeoutMs?: number } = {
      script: targetedScript,
      args: { ...baseArgs, ...extraArgs },
    };
    if (opts.timeoutMs !== undefined) targetedRunArgs.timeoutMs = opts.timeoutMs;
    const result = await runAppleScript(targetedRunArgs);
    if (result !== NOT_FOUND_MARKER) return result;
    // Fall through to brute-force on miss.
  }

  const fallbackScript = `
    tell application "Mail"
      set foundMsg to missing value
      repeat with acct in accounts
        repeat with mb in mailboxes of acct
          set candidates to (messages of mb whose message id is theMsgId)
          if (count of candidates) > 0 then
            set foundMsg to item 1 of candidates
            exit repeat
          end if
        end repeat
        if foundMsg is not missing value then exit repeat
      end repeat
      if foundMsg is missing value then return "${NOT_FOUND_MARKER}"
      ${opts.action}
    end tell
  `;
  const fallbackRunArgs: { script: string; args: Record<string, string>; timeoutMs?: number } = {
    script: fallbackScript,
    args: { theMsgId: bareId, ...extraArgs },
  };
  if (opts.timeoutMs !== undefined) fallbackRunArgs.timeoutMs = opts.timeoutMs;
  return runAppleScript(fallbackRunArgs);
}

/** Sentinel returned by findMessageAndAct when both targeted and fallback miss. */
export const MESSAGE_NOT_FOUND = NOT_FOUND_MARKER;
