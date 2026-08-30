import { describe, it, expect } from "vitest";
import { analyzeJson } from "@/lib/json";

describe("json analyzer", () => {
  it("formats valid json and reports stats", () => {
    const r = analyzeJson('{"a":1,"b":[1,2]}', 2);
    expect(r.ok).toBe(true);
    expect(r.output).toContain('"a": 1');
    expect(r.stats?.keys).toBe(2);
    expect(r.stats?.arrays).toBe(1);
  });

  it("diagnoses trailing comma with suggestion", () => {
    const r = analyzeJson('{"a":1,}');
    expect(r.ok).toBe(false);
    expect(r.issues[0].type).toBe("error");
  });

  it("flags duplicate keys", () => {
    const r = analyzeJson('{"a":1,"a":2}');
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.message.includes("重复"))).toBe(true);
  });
});
