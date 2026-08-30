import { describe, it, expect } from "vitest";
import {
  getHolidaySummary,
  STATUTORY_HOLIDAY_DAYS,
  HOLIDAY_DATA_LAST_VERIFIED,
  buildYearGrids,
  findFestivalForDate,
  formatFestivalSpan,
  getNextHoliday,
  getNextMakeup,
  getTodayIso,
  buildYearIcs,
} from "@/lib/holiday";

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

  it("data freshness is annotated (2026-08 核对)", () => {
    expect(HOLIDAY_DATA_LAST_VERIFIED).toBe("2026-08");
    for (const year of [2025, 2026, 2027]) {
      expect(getHolidaySummary(year)!.lastVerified).toBe("2026-08");
    }
  });

  it("expands ranges into concrete off-dates", () => {
    const s = getHolidaySummary(2026)!;
    const spring = s.festivals.find((f) => f.name === "春节")!;
    expect(spring.offDays).toBe(9);
    expect(spring.offDates[0]).toBe("2026-02-15");
    expect(spring.offDates[8]).toBe("2026-02-23");
  });
});

describe("year calendar matrix (buildYearGrids)", () => {
  it("builds 12 month grids; Jan 2026 pads 4 leading blanks before Thursday 1/1", () => {
    const grids = buildYearGrids(2026);
    expect(grids).toHaveLength(12);
    const jan = grids[0];
    expect(jan.month).toBe(1);
    expect(jan.cells).toHaveLength(35); // 首日周四(偏移4)+31天 = 5 整周
    for (let i = 0; i < 4; i++) expect(jan.cells[i]).toBeNull();
    const d1 = jan.cells[4]!;
    expect(d1.iso).toBe("2026-01-01");
    expect(d1.weekday).toBe(4); // 周四
    expect(d1.status).toBe("off");
    expect(d1.festival).toBe("元旦");
    expect(d1.festivalStart).toBe(true);
  });

  it("回归：任何月格子不得溢出当月天数（2026-03 曾渲染出 32–35）", () => {
    for (const year of [2025, 2026, 2027]) {
      const grids = buildYearGrids(year);
      grids.forEach((g) => {
        const daysInMonth = new Date(Date.UTC(year, g.month, 0)).getUTCDate();
        expect(g.cells.length).toBeLessThanOrEqual(37);
        for (const c of g.cells) {
          if (!c) continue;
          expect(c.day).toBeGreaterThanOrEqual(1);
          expect(c.day).toBeLessThanOrEqual(daysInMonth);
          expect(c.iso).toBe(
            `${year}-${String(g.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`
          );
        }
      });
    }
    // 具体锚点：2026-03（首日周日+31天）末行只到 31，共 31 个日期格
    const mar = buildYearGrids(2026)[2];
    expect(mar.cells.filter(Boolean)).toHaveLength(31);
    expect(mar.cells.at(-1)!.day).toBe(31);
  });

  it("off beats weekend; makeup beats weekend; plain weekend detected", () => {
    const grids = buildYearGrids(2026);
    const feb = grids[1];
    expect(feb.cells).toHaveLength(28); // 2026-02-01 恰为周日
    // 2026-10-03 是周六但属国庆放假 → off 优先
    const oct3 = grids[9].cells.find((c) => c?.iso === "2026-10-03")!;
    expect(oct3.status).toBe("off");
    // 2026-02-14 是周六但是春节补班 → makeup 优先
    const feb14 = feb.cells.find((c) => c?.iso === "2026-02-14")!;
    expect(feb14.status).toBe("makeup");
    expect(feb14.weekday).toBe(6);
    expect(feb14.festival).toBe("春节");
    // 2026-03-07 周六，无假期 → weekend
    const mar7 = grids[2].cells.find((c) => c?.iso === "2026-03-07")!;
    expect(mar7.status).toBe("weekend");
    // 非区间首日不标 festivalStart
    const feb16 = feb.cells.find((c) => c?.iso === "2026-02-16")!;
    expect(feb16.status).toBe("off");
    expect(feb16.festivalStart).toBe(false);
  });

  it("2027 grid renders honestly: only weekend/workday, no fabricated marks", () => {
    const grids = buildYearGrids(2027);
    expect(grids).toHaveLength(12);
    const statuses = new Set(grids.flatMap((g) => g.cells.filter(Boolean).map((c) => c!.status)));
    expect(statuses.has("off")).toBe(false);
    expect(statuses.has("makeup")).toBe(false);
    expect(statuses).toEqual(new Set(["weekend", "workday"]));
  });
});

describe("festival lookup & span text", () => {
  it("findFestivalForDate distinguishes off vs makeup vs none", () => {
    expect(findFestivalForDate(2026, "2026-02-17")!.festival.name).toBe("春节");
    expect(findFestivalForDate(2026, "2026-02-17")!.role).toBe("off");
    expect(findFestivalForDate(2026, "2026-02-28")!.role).toBe("makeup");
    expect(findFestivalForDate(2026, "2026-03-15")).toBeNull();
    expect(findFestivalForDate(2027, "2026-02-17")).toBeNull();
  });

  it("formatFestivalSpan renders the full sentence incl. makeup days", () => {
    const spring = findFestivalForDate(2026, "2026-02-18")!.festival;
    expect(formatFestivalSpan(spring)).toBe("2月15日–2月23日放假共9天，2月14日、2月28日补班");
    const midAutumn = findFestivalForDate(2026, "2026-09-26")!.festival;
    expect(formatFestivalSpan(midAutumn)).toBe("9月25日–9月27日放假共3天");
    const yuanDan25 = findFestivalForDate(2025, "2025-01-01")!.festival;
    expect(formatFestivalSpan(yuanDan25)).toBe("1月1日放假共1天");
  });
});

describe("countdown (client-date pure functions)", () => {
  it("next holiday: 中秋节 2026-09-25 is 25 days from 2026-08-31", () => {
    expect(getNextHoliday("2026-08-31")).toEqual({ name: "中秋节", iso: "2026-09-25", days: 25 });
  });

  it("next makeup: 国庆节补班 2026-09-20 is 20 days from 2026-08-31", () => {
    expect(getNextMakeup("2026-08-31")).toEqual({ name: "国庆节", iso: "2026-09-20", days: 20 });
  });

  it("days = 0 when today IS the target; scans across years", () => {
    expect(getNextHoliday("2026-10-01")).toEqual({ name: "国庆节", iso: "2026-10-01", days: 0 });
    expect(getNextMakeup("2026-10-10")).toEqual({ name: "国庆节", iso: "2026-10-10", days: 0 });
  });

  it("honest null beyond published data (2027 unpublished)", () => {
    expect(getNextHoliday("2026-12-31")).toBeNull();
    expect(getNextMakeup("2026-10-11")).toBeNull();
  });

  it("getTodayIso uses local date parts", () => {
    expect(getTodayIso(new Date(2026, 7, 31))).toBe("2026-08-31");
  });
});

describe(".ics export (pure string assembly)", () => {
  it("2026: VCALENDAR with 13 events (7 off + 6 makeup), DTEND exclusive", () => {
    const ics = buildYearIcs(2026);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("BEGIN:VEVENT")).toHaveLength(14); // 13 events
    expect(ics).toContain("DTSTART;VALUE=DATE:20260215");
    expect(ics).toContain("DTEND;VALUE=DATE:20260224"); // 春节 2/23 → 排他 DTEND 2/24
    expect(ics).toContain("春节·补班");
    expect(ics).toContain("数据核对至 2026-08");
  });

  it("refuses to fabricate: unpublished 2027 exports empty string", () => {
    expect(buildYearIcs(2027)).toBe("");
  });
});
