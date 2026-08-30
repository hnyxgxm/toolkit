import { describe, it, expect } from "vitest";
import { getHolidaySummary, STATUTORY_HOLIDAY_DAYS } from "@/lib/holiday";

// 数据以国务院办公厅通知为准；这些 total 是官方口径的核对锚点。
describe("holiday engine", () => {
  it("2025 official: 28 放假 / 5 补班", () => {
    const s = getHolidaySummary(2025)!;
    expect(s.official).toBe(true);
    expect(s.totalOffDays).toBe(28);
    expect(s.totalMakeupDays).toBe(5);
  });

  it("2026 official: 33 放假 / 6 补班", () => {
    const s = getHolidaySummary(2026)!;
    expect(s.official).toBe(true);
    expect(s.totalOffDays).toBe(33);
    expect(s.totalMakeupDays).toBe(6);
  });

  it("2027 NOT official → refuses to fabricate a schedule", () => {
    const s = getHolidaySummary(2027)!;
    expect(s.official).toBe(false);
    expect(s.festivals.length).toBe(0); // 关键：不编造具体日期
  });

  it("statutory floor is a known fact", () => {
    expect(STATUTORY_HOLIDAY_DAYS).toBe(11);
  });

  it("expands ranges into concrete off-dates", () => {
    const s = getHolidaySummary(2026)!;
    const spring = s.festivals.find((f) => f.name === "春节")!;
    expect(spring.offDays).toBe(9);
    expect(spring.offDates[0]).toBe("2026-02-15");
    expect(spring.offDates[8]).toBe("2026-02-23");
  });
});
