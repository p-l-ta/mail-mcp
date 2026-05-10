import { describe, it, expect } from "vitest";
import { __test } from "../tools/submit_feedback.js";

const { buildIssueUrl } = __test;

const BASE = "https://github.com/p-l-ta/mail-mcp/issues/new";

describe("buildIssueUrl", () => {
  it("includes the description in the body", () => {
    const url = buildIssueUrl({ title: "Bug", description: "It broke", macosVersion: "15.0", pkgVersion: "1.2.3" });
    const params = new URL(url).searchParams;
    expect(params.get("body")).toContain("It broke");
  });

  it("appends macOS and package version to the body", () => {
    const url = buildIssueUrl({ title: "Bug", description: "desc", macosVersion: "15.4.1", pkgVersion: "1.1.1" });
    const body = new URL(url).searchParams.get("body")!;
    expect(body).toContain("**mail-mcp version:** 1.1.1");
    expect(body).toContain("**macOS version:** 15.4.1");
  });

  it("uses the provided title when given", () => {
    const url = buildIssueUrl({ title: "My Title", description: "desc", macosVersion: "15.0", pkgVersion: "1.0.0" });
    expect(new URL(url).searchParams.get("title")).toBe("My Title");
  });

  it("generates a title from the description when title is omitted", () => {
    const url = buildIssueUrl({ title: undefined, description: "Something went wrong", macosVersion: "15.0", pkgVersion: "1.0.0" });
    const title = new URL(url).searchParams.get("title")!;
    expect(title).toContain("Something went wrong");
    expect(title).toMatch(/^\[Feedback\]/);
  });

  it("truncates a long description in the auto-generated title", () => {
    const long = "A".repeat(100);
    const url = buildIssueUrl({ title: undefined, description: long, macosVersion: "15.0", pkgVersion: "1.0.0" });
    const title = new URL(url).searchParams.get("title")!;
    expect(title).toContain("…");
    expect(title.length).toBeLessThan(80);
  });

  it("points at the correct GitHub repo", () => {
    const url = buildIssueUrl({ title: "t", description: "d", macosVersion: "15.0", pkgVersion: "1.0.0" });
    expect(url).toMatch(/^https:\/\/github\.com\/p-l-ta\/mail-mcp\/issues\/new/);
  });
});
