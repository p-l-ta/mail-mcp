import { describe, it, expect } from "vitest";
import { __test } from "../tools/flags.js";

describe("flags.buildAction", () => {
  it("emits the read op when only read is provided", () => {
    const s = __test.buildAction({ read: true });
    expect(s).toContain("set read status of foundMsg to true");
    expect(s).not.toContain("set flagged status");
  });

  it("emits both ops when both are provided", () => {
    const s = __test.buildAction({ read: false, flagged: true });
    expect(s).toContain("set read status of foundMsg to false");
    expect(s).toContain("set flagged status of foundMsg to true");
  });

  it("emits the flagged op when only flagged is provided", () => {
    const s = __test.buildAction({ flagged: false });
    expect(s).toContain("set flagged status of foundMsg to false");
    expect(s).not.toContain("set read status");
  });

  it("ends with a return statement so the runner gets a result", () => {
    const s = __test.buildAction({ read: true });
    expect(s).toMatch(/return "ok"/);
  });
});
