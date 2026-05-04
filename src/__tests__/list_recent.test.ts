import { describe, it, expect } from "vitest";
import { __test } from "../tools/list_recent.js";

const SEP = String.fromCharCode(31);

describe("list_recent.parse", () => {
  it("parses field-separated message records", () => {
    const lines = [
      ["Hello", "alice@example.com", "Mon Jan 1 12:00", "true", "<a@x>"].join(SEP),
      ["Re: Plans", "bob@example.com", "Tue Jan 2 09:30", "false", "<b@x>"].join(SEP),
    ];
    const raw = lines.join("\n");
    const out = __test.parse(raw);
    expect(out).toEqual([
      {
        subject: "Hello",
        from: "alice@example.com",
        date: "Mon Jan 1 12:00",
        unread: true,
        messageId: "<a@x>",
      },
      {
        subject: "Re: Plans",
        from: "bob@example.com",
        date: "Tue Jan 2 09:30",
        unread: false,
        messageId: "<b@x>",
      },
    ]);
  });

  it("skips malformed lines", () => {
    const raw = `bad line\n${["s", "f", "d", "true", "<m>"].join(SEP)}`;
    expect(__test.parse(raw)).toHaveLength(1);
  });
});
