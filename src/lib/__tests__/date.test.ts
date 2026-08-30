import { describe, it, expect } from "vitest";
import { diffDates, addWorkdays, weekdayCN, parseISO } from "@/lib/date";

// 这些用例直接对应线上「日期差值」的边界 bug（旧实现周末出现 -1）。
describe("date engine", () => {
  it("parses and rejects invalid dates", () => {
    expect(parseISO("2024-02-29")).not.toBeNull(); // 闰日合法
    expect(parseISO("2025-02-29")).toBeNull(); // 非闰年
    expect(parseISO("2024-13-01")).toBeNull();
    expect(parseISO("bad")).toBeNull();
  });

  it("weekday lookup incl. leap day", () => {
    expect(weekdayCN("2024-02-29")).toBe("星期四");
    expect(weekdayCN("2026-08-30")).toBe("星期日");
    expect(weekdayCN("2000-01-01")).toBe("星期六");
  });

  it("inclusive range counts both endpoints", () => {
    const r = diffDates("2024-02-29", "2024-03-01", "inclusive");
    expect(r.ok).toBe(true);
    expect(r.totalDays).toBe(2); // 周四+周五
    expect(r.workdays).toBe(2);
    expect(r.weekendDays).toBe(0);
  });

  it("exclusive range excludes end", () => {
    const r = diffDates("2024-02-29", "2024-03-01", "exclusive");
    expect(r.totalDays).toBe(1);
    expect(r.workdays).toBe(1);
    expect(r.weekendDays).toBe(0); // 旧实现在此会算出 -1
  });

  it("weekend is NEVER negative and total = work + weekend (regression)", () => {
    const cases = [
      ["2024-02-29", "2024-03-01"],
      ["2026-01-01", "2026-12-31"],
      ["2026-08-30", "2026-09-06"],
      ["2023-01-01", "2023-01-02"],
      ["2020-02-28", "2020-03-01"],
    ] as const;
    for (const [s, e] of cases) {
      for (const mode of ["inclusive", "exclusive"] as const) {
        const r = diffDates(s, e, mode);
        expect(r.weekendDays).toBeGreaterThanOrEqual(0);
        expect(r.totalDays).toBe(r.workdays + r.weekendDays);
      }
    }
  });

  it("full-year 2026 (inclusive): 365 / 261 / 104", () => {
    const r = diffDates("2026-01-01", "2026-12-31", "inclusive");
    expect(r.totalDays).toBe(365);
    expect(r.workdays).toBe(261);
    expect(r.weekendDays).toBe(104);
  });

  it("rejects end-before-start", () => {
    const r = diffDates("2026-05-10", "2026-05-01", "inclusive");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("不能早于");
  });

  it("addWorkdays skips weekends", () => {
    // 2026-08-28 是周五，+1 工作日 → 跳过周六日 → 周一 08-31
    expect(addWorkdays("2026-08-28", 1).result).toBe("2026-08-31");
    expect(addWorkdays("2026-08-28", -1).result).toBe("2026-08-27");
    expect(addWorkdays("bad", 3).ok).toBe(false);
  });

  it("addWorkdays skips a holiday when provided", () => {
    const holiday = new Set([Date.UTC(2026, 7, 31)]); // 08-31 当作放假
    // 周五 08-28 +1 工作日，08-31 被跳过 → 09-01
    expect(addWorkdays("2026-08-28", 1, holiday).result).toBe("2026-09-01");
  });
});
