import { describe, it, expect } from "vitest";
import {
  diffDates,
  addWorkdays,
  weekdayCN,
  parseISO,
  isLeapYear,
  dayOfYear,
  shiftISO,
  monthMatrix,
  weekdayInfo,
  weekdayInfoLines,
  diffUnits,
  formatDurationCN,
  formatWeeksCN,
  toISO,
} from "@/lib/date";

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

/* ============ 第二轮重做新增：多单位时长拆解 ============ */
describe("diffUnits (multi-unit breakdown)", () => {
  const DAY = 86_400_000;

  /** 测试侧独立重建：起始日 + months（月末收敛）+ days 必须等于有效结束日 */
  function clampAdd(sMs: number, months: number, extraDays: number): number {
    const sd = Number(toISO(sMs).slice(8, 10));
    const sy = Number(toISO(sMs).slice(0, 4));
    const sm = Number(toISO(sMs).slice(5, 7));
    const y = sy + Math.floor((sm - 1 + months) / 12);
    const m0 = (((sm - 1 + months) % 12) + 12) % 12;
    const dim = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    return Date.UTC(y, m0, Math.min(sd, dim)) + extraDays * DAY;
  }

  const cases = [
    ["2026-01-01", "2026-12-31"],
    ["2024-02-29", "2024-03-01"],
    ["2026-01-01", "2026-03-01"],
    ["2024-01-31", "2024-03-01"], // 月末借位
    ["2023-01-01", "2023-01-02"],
    ["2026-08-30", "2026-09-06"],
    ["2020-02-28", "2021-02-28"],
  ] as const;

  it("invariant: clamp-add(years*12+months, days) reconstructs effective end", () => {
    for (const [s, e] of cases) {
      for (const mode of ["inclusive", "exclusive"] as const) {
        const u = diffUnits(s, e, mode);
        expect(u).not.toBeNull();
        const sMs = parseISO(s)!;
        const eMs = parseISO(e)!;
        const effEnd = mode === "inclusive" ? eMs + DAY : eMs;
        expect(clampAdd(sMs, u!.years * 12 + u!.months, u!.days)).toBe(effEnd);
      }
    }
  });

  it("invariant: weeks*7 + weekRemainder === totalDays, and totalDays matches diffDates", () => {
    for (const [s, e] of cases) {
      for (const mode of ["inclusive", "exclusive"] as const) {
        const u = diffUnits(s, e, mode)!;
        expect(u.weeks * 7 + u.weekRemainder).toBe(u.totalDays);
        expect(u.totalDays).toBe(diffDates(s, e, mode).totalDays);
      }
    }
  });

  it("full year 2026 inclusive → 1 年 0 个月 0 天 (365 = 52 周 + 1 天)", () => {
    const u = diffUnits("2026-01-01", "2026-12-31", "inclusive")!;
    expect(u.years).toBe(1);
    expect(u.months).toBe(0);
    expect(u.days).toBe(0);
    expect(u.totalDays).toBe(365);
    expect(u.weeks).toBe(52);
    expect(u.weekRemainder).toBe(1);
  });

  it("leap day inclusive Feb29→Mar01 stays 2 days, 0 months", () => {
    const u = diffUnits("2024-02-29", "2024-03-01", "inclusive")!;
    expect(u.years).toBe(0);
    expect(u.months).toBe(0);
    expect(u.days).toBe(2);
  });

  it("month-end borrow: 2024-01-31 → 2024-03-01 exclusive → 1 个月 1 天", () => {
    const u = diffUnits("2024-01-31", "2024-03-01", "exclusive")!;
    expect(u.months).toBe(1);
    expect(u.days).toBe(1);
    expect(u.totalDays).toBe(30);
  });

  it("returns null for invalid or reversed range", () => {
    expect(diffUnits("bad", "2026-01-01", "inclusive")).toBeNull();
    expect(diffUnits("2026-01-01", "nope", "inclusive")).toBeNull();
    expect(diffUnits("2026-05-10", "2026-05-01", "inclusive")).toBeNull();
  });

  it("formatDurationCN omits leading zeros, all-zero → 0 天", () => {
    expect(formatDurationCN({ years: 0, months: 0, days: 0 })).toBe("0 天");
    expect(formatDurationCN({ years: 0, months: 5, days: 0 })).toBe("5 个月");
    expect(formatDurationCN({ years: 1, months: 2, days: 3 })).toBe("1 年 2 个月 3 天");
    expect(formatDurationCN({ years: 0, months: 0, days: 45 })).toBe("45 天");
  });

  it("formatWeeksCN renders 周 + 余数天", () => {
    expect(formatWeeksCN({ weeks: 52, weekRemainder: 1 })).toBe("52 周 1 天");
    expect(formatWeeksCN({ weeks: 0, weekRemainder: 6 })).toBe("0 周 6 天");
  });
});

/* ============ 第二轮重做新增：星期查询扩展 ============ */
describe("weekday extras", () => {
  it("isLeapYear: 4/100/400 rule", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // 百年不闰
    expect(isLeapYear(2000)).toBe(true); // 四百年再闰
  });

  it("dayOfYear is 1-based and leap-aware", () => {
    expect(dayOfYear(parseISO("2026-01-01")!)).toBe(1);
    expect(dayOfYear(parseISO("2026-12-31")!)).toBe(365);
    expect(dayOfYear(parseISO("2024-12-31")!)).toBe(366); // 闰年
    expect(dayOfYear(parseISO("2024-02-29")!)).toBe(60);
  });

  it("shiftISO crosses month/year boundaries and rejects bad input", () => {
    expect(shiftISO("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftISO("2024-02-28", 1)).toBe("2024-02-29"); // 闰年
    expect(shiftISO("2025-02-28", 1)).toBe("2025-03-01"); // 平年
    expect(shiftISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftISO("bad", 3)).toBeNull();
    // 往返不变式：shift 后再 shift 回来等于原值
    expect(shiftISO(shiftISO("2026-08-30", 7)!, -7)).toBe("2026-08-30");
  });

  it("monthMatrix is Monday-first with 7-cell rows and round-trips ISO", () => {
    const rows = monthMatrix(2026, 8); // 2026-08-01 是周六
    for (const row of rows) expect(row).toHaveLength(7);
    expect(rows[0]!.slice(0, 5)).toEqual([null, null, null, null, null]); // 周一~周五留白
    expect(rows[0]![5]).toBe("2026-08-01");
    // 全部非空格解析回合法日期，且按列序连续
    const flat = rows.flat().filter((c): c is string => c !== null);
    expect(flat[0]).toBe("2026-08-01");
    expect(flat[flat.length - 1]).toBe("2026-08-31");
    for (let i = 1; i < flat.length; i += 1) {
      expect(shiftISO(flat[i - 1]!, 1)).toBe(flat[i]);
    }
  });

  it("weekdayInfo aggregates: leap day of a leap year", () => {
    const info = weekdayInfo("2024-02-29")!;
    expect(info.cn).toBe("星期四");
    expect(info.isWeekend).toBe(false);
    expect(info.dayOfYear).toBe(60);
    expect(info.year).toBe(2024);
    expect(info.isLeap).toBe(true);
    expect(info.isoWeekWeek).toBe(9); // 2024-02-29 属 ISO 第 9 周
    expect(info.isoWeekFrom).toBe("2024-02-26");
    expect(info.isoWeekTo).toBe("2024-03-03");
  });

  it("weekdayInfo flags weekend and non-leap year", () => {
    const info = weekdayInfo("2026-08-30")!;
    expect(info.cn).toBe("星期日");
    expect(info.isWeekend).toBe(true);
    expect(info.isLeap).toBe(false);
    expect(weekdayInfo("2026-13-01")).toBeNull();
  });

  it("weekdayInfoLines skips empty lines and echoes raw", () => {
    const rows = weekdayInfoLines("2026-01-01\n\n  2026-08-30  \noops\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.raw).toBe("2026-01-01");
    expect(rows[0]!.info!.cn).toBe("星期四");
    expect(rows[1]!.raw).toBe("2026-08-30");
    expect(rows[1]!.info!.cn).toBe("星期日");
    expect(rows[2]!.raw).toBe("oops");
    expect(rows[2]!.info).toBeNull();
  });
});
