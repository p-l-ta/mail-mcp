import { describe, it, expect } from "vitest";
import { __test } from "../tools/list_rules.js";

const { resolveColor, resolveQualifier } = __test;

// ---------------------------------------------------------------------------
// resolveQualifier
// ---------------------------------------------------------------------------

describe("resolveQualifier", () => {
  it("returns the explicit qualifier when provided", () => {
    expect(resolveQualifier("From", "BeginsWith")).toBe("BeginsWith");
    expect(resolveQualifier("Subject", "Contains")).toBe("Contains");
  });

  it("defaults to Contains for standard string-comparison headers", () => {
    expect(resolveQualifier("From", undefined)).toBe("Contains");
    expect(resolveQualifier("To", undefined)).toBe("Contains");
    expect(resolveQualifier("Subject", undefined)).toBe("Contains");
    expect(resolveQualifier("Body", undefined)).toBe("Contains");
  });

  it("returns null for boolean headers (no qualifier makes sense)", () => {
    expect(resolveQualifier("IsJunkMail", undefined)).toBeNull();
    expect(resolveQualifier("SenderIsNotInAddressBook", undefined)).toBeNull();
    expect(resolveQualifier("Account", undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveColor
// ---------------------------------------------------------------------------

describe("resolveColor", () => {
  it("returns null object when colorValue is undefined", () => {
    expect(resolveColor(false, undefined)).toEqual({ type: null, name: null, value: null });
    expect(resolveColor(true, undefined)).toEqual({ type: null, name: null, value: null });
  });

  it("resolves known text-highlight colors", () => {
    expect(resolveColor(true, 9485826)).toEqual({ type: "text", name: "green", value: 9485826 });
    expect(resolveColor(true, 8674197)).toEqual({ type: "text", name: "purple", value: 8674197 });
    expect(resolveColor(true, 14134016)).toEqual({ type: "text", name: "yellow", value: 14134016 });
    expect(resolveColor(true, 14819865)).toEqual({ type: "text", name: "red", value: 14819865 });
    expect(resolveColor(true, 3503295)).toEqual({ type: "text", name: "blue", value: 3503295 });
    expect(resolveColor(true, 6977676)).toEqual({ type: "text", name: "gray", value: 6977676 });
  });

  it("resolves known message-row colors", () => {
    expect(resolveColor(false, 13235369)).toEqual({ type: "message", name: "green", value: 13235369 });
    expect(resolveColor(false, 14136549)).toEqual({ type: "message", name: "purple", value: 14136549 });
    expect(resolveColor(false, 16750738)).toEqual({ type: "message", name: "red", value: 16750738 });
    expect(resolveColor(false, 16763531)).toEqual({ type: "message", name: "orange", value: 16763531 });
  });

  it("returns null object for the message-row 'none' sentinel value", () => {
    expect(resolveColor(false, 9158119)).toEqual({ type: null, name: null, value: null });
  });

  it("returns null name for unknown color integers (preserves raw value)", () => {
    const r = resolveColor(true, 99999);
    expect(r.name).toBeNull();
    expect(r.value).toBe(99999);
    expect(r.type).toBe("text");
  });

  it("returns null object for unknown message-row color integers", () => {
    // Unknown message-row integers are treated as type:null since we can't name them
    const r = resolveColor(false, 99999);
    expect(r).toEqual({ type: null, name: null, value: null });
  });
});
