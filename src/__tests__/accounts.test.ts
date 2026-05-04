import { describe, it, expect } from "vitest";
import { __test } from "../tools/accounts.js";

describe("accounts.parse", () => {
  it("parses the delimited account/mailbox stream", () => {
    const raw = [
      "ACCOUNT\tiCloud\talice@icloud.com",
      "MAILBOX\tINBOX\t3",
      "MAILBOX\tArchive\t0",
      "ACCOUNT\tWork\tbob@corp.com",
      "MAILBOX\tINBOX\t12",
    ].join("\n");
    const accounts = __test.parse(raw);
    expect(accounts).toEqual([
      {
        name: "iCloud",
        user: "alice@icloud.com",
        mailboxes: [
          { name: "INBOX", unread: 3 },
          { name: "Archive", unread: 0 },
        ],
      },
      {
        name: "Work",
        user: "bob@corp.com",
        mailboxes: [{ name: "INBOX", unread: 12 }],
      },
    ]);
  });

  it("returns empty list for empty input", () => {
    expect(__test.parse("")).toEqual([]);
  });
});
