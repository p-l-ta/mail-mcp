import { describe, it, expect } from "vitest";
import { buildSearchSql, rowToHit } from "../lib/envelope-index.js";

describe("buildSearchSql", () => {
  it("excludes deleted by default", () => {
    const sql = buildSearchSql({ query: "x", limit: 10 });
    expect(sql).toContain("m.deleted = 0");
    expect(sql).toContain("LIMIT 10");
    expect(sql).toContain("ORDER BY m.date_received DESC");
  });

  it("includes deleted when include_deleted is true", () => {
    const sql = buildSearchSql({ query: "x", limit: 10, include_deleted: true });
    expect(sql).not.toContain("m.deleted = 0");
  });

  it("matches query against subject, sender address/name, and summary", () => {
    const sql = buildSearchSql({ query: "invoice", limit: 5 });
    expect(sql).toContain("s.subject LIKE '%invoice%'");
    expect(sql).toContain("a.address LIKE '%invoice%'");
    expect(sql).toContain("a.comment LIKE '%invoice%'");
    expect(sql).toContain("sm.summary LIKE '%invoice%'");
  });

  it("escapes single quotes in user input", () => {
    const sql = buildSearchSql({ query: "O'Reilly", limit: 5 });
    expect(sql).toContain("'%O''Reilly%'");
    expect(sql).not.toMatch(/'%O'Reilly%'/);
  });

  it("converts since to a unix timestamp", () => {
    const sql = buildSearchSql({
      since: "2024-01-01T00:00:00Z",
      query: "x",
      limit: 5,
    });
    expect(sql).toContain(`m.date_received >= ${Math.floor(Date.UTC(2024, 0, 1) / 1000)}`);
  });

  it("filters from on both address and comment", () => {
    const sql = buildSearchSql({ from: "alice@example.com", query: "x", limit: 5 });
    expect(sql).toContain("a.address LIKE '%alice@example.com%'");
    expect(sql).toContain("a.comment LIKE '%alice@example.com%'");
  });

  it("applies subject and account filters", () => {
    const sql = buildSearchSql({
      subject: "report",
      account: "icloud",
      query: "x",
      limit: 5,
    });
    expect(sql).toContain("s.subject LIKE '%report%'");
    expect(sql).toContain("mb.url LIKE '%icloud%'");
  });
});

describe("rowToHit", () => {
  it("maps a raw row, parses dates, joins subject_prefix", () => {
    const hit = rowToHit({
      rowid: 42,
      message_id_text: "<abc@example.com>",
      remote_id: 12345,
      subject_prefix: "Re: ",
      subject_text: "Hello",
      sender_address: "alice@example.com",
      sender_comment: "Alice Doe",
      date_received: 1723222039,
      summary_text: "  hi   there\nfriend  ",
      read: 0,
      flagged: 1,
      deleted: 0,
      size: 1234,
      mailbox_url: "imap://user%40icloud.com@imap.mail.me.com:993/INBOX",
    });
    expect(hit).toMatchObject({
      rowid: 42,
      messageId: "<abc@example.com>",
      remoteId: 12345,
      subject: "Re: Hello",
      fromAddress: "alice@example.com",
      fromName: "Alice Doe",
      read: false,
      flagged: true,
      deleted: false,
      size: 1234,
      snippet: "hi there friend",
      mailboxName: "INBOX",
    });
    expect(hit.dateReceived).toMatch(/^2024-08-09T/);
  });

  it("handles null optional fields", () => {
    const hit = rowToHit({
      rowid: 1,
      message_id_text: null,
      remote_id: null,
      subject_prefix: null,
      subject_text: null,
      sender_address: null,
      sender_comment: null,
      date_received: null,
      summary_text: null,
      read: 1,
      flagged: 0,
      deleted: 0,
      size: 0,
      mailbox_url: "ews://mail.corp.com/folders/Inbox",
    });
    expect(hit.subject).toBe("");
    expect(hit.snippet).toBeNull();
    expect(hit.dateReceived).toBe("");
    expect(hit.mailboxName).toBe("folders/Inbox");
  });
});
