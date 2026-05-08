import { describe, it, expect } from "vitest";
import { parseMailboxUrl } from "../lib/locate.js";

describe("parseMailboxUrl", () => {
  it("parses an iCloud IMAP URL", () => {
    expect(
      parseMailboxUrl("imap://paul%40templinashford.net@imap.mail.me.com:993/INBOX"),
    ).toEqual({
      userName: "paul@templinashford.net",
      mailboxPath: "INBOX",
    });
  });

  it("preserves slash-pathed nested mailboxes", () => {
    expect(
      parseMailboxUrl("imap://paul%40templinashford.net@imap.mail.me.com/Folders/Amtrak"),
    ).toEqual({
      userName: "paul@templinashford.net",
      mailboxPath: "Folders/Amtrak",
    });
  });

  it("handles imaps:// (TLS) and ews:// (Exchange) URLs", () => {
    expect(parseMailboxUrl("imaps://alice@example.com@mail.example.com/Sent")).toEqual({
      userName: "alice@example.com",
      mailboxPath: "Sent",
    });
    expect(parseMailboxUrl("ews://bob@corp.com@mail.corp.com/folders/Inbox")).toEqual({
      userName: "bob@corp.com",
      mailboxPath: "folders/Inbox",
    });
  });

  it("decodes percent-encoded mailbox names", () => {
    expect(
      parseMailboxUrl("imap://u@host/Caf%C3%A9%20Drafts"),
    ).toEqual({
      userName: "u",
      mailboxPath: "Café Drafts",
    });
  });

  it("returns null for local On-My-Mac mailboxes (no user info)", () => {
    expect(parseMailboxUrl("local-mailboxes:///INBOX")).toBeNull();
    expect(parseMailboxUrl("file:///Users/me/Library/Mail/INBOX")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(parseMailboxUrl("not a url")).toBeNull();
    expect(parseMailboxUrl("")).toBeNull();
  });

  it("returns null when path is empty", () => {
    expect(parseMailboxUrl("imap://u@host")).toBeNull();
    expect(parseMailboxUrl("imap://u@host/")).toBeNull();
  });
});
