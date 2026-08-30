/**
 * 节假日引擎（纯函数 + 官方数据）
 *
 * 设计要点（修复线上问题）：
 *  线上把 2027 的"预测值"和已确认年份长得一样呈现，用户无法分辨权威 vs 猜测。
 *  这里用 official 标记区分来源，未公布的年份只给出"确定性事实"（法定节假日共 11 天），
 *  不编造具体调休日期。数据来自国务院办公厅节日安排通知。
 */

export interface Festival {
  name: string;
  /** 放假区间 [起ISO, 止ISO]，含两端 */
  off: Array<[string, string]>;
  /** 补班（周末上班）日期 */
  makeup: string[];
}

export interface HolidayYear {
  year: number;
  official: boolean;
  source: string;
  festivals: Festival[];
}

export const HOLIDAY_DATA: Record<number, HolidayYear> = {
  2025: {
    year: 2025,
    official: true,
    source: "国务院办公厅关于2025年部分节假日安排的通知",
    festivals: [
      { name: "元旦", off: [["2025-01-01", "2025-01-01"]], makeup: [] },
      { name: "春节", off: [["2025-01-28", "2025-02-04"]], makeup: ["2025-01-26", "2025-02-08"] },
      { name: "清明节", off: [["2025-04-04", "2025-04-06"]], makeup: [] },
      { name: "劳动节", off: [["2025-05-01", "2025-05-05"]], makeup: ["2025-04-27"] },
      { name: "端午节", off: [["2025-05-31", "2025-06-02"]], makeup: [] },
      { name: "国庆节·中秋节", off: [["2025-10-01", "2025-10-08"]], makeup: ["2025-09-28", "2025-10-11"] },
    ],
  },
  2026: {
    year: 2026,
    official: true,
    source: "国务院办公厅关于2026年部分节假日安排的通知（国办发明电〔2025〕7号）",
    festivals: [
      { name: "元旦", off: [["2026-01-01", "2026-01-03"]], makeup: ["2026-01-04"] },
      { name: "春节", off: [["2026-02-15", "2026-02-23"]], makeup: ["2026-02-14", "2026-02-28"] },
      { name: "清明节", off: [["2026-04-04", "2026-04-06"]], makeup: [] },
      { name: "劳动节", off: [["2026-05-01", "2026-05-05"]], makeup: ["2026-05-09"] },
      { name: "端午节", off: [["2026-06-19", "2026-06-21"]], makeup: [] },
      { name: "中秋节", off: [["2026-09-25", "2026-09-27"]], makeup: [] },
      { name: "国庆节", off: [["2026-10-01", "2026-10-07"]], makeup: ["2026-09-20", "2026-10-10"] },
    ],
  },
  2027: {
    year: 2027,
    official: false,
    source: "官方安排尚未发布（通常在上年 11–12 月公布）",
    festivals: [],
  },
};

export const AVAILABLE_YEARS = [2025, 2026, 2027];

/** 法定节假日总天数（不含调休拼假）——这是《全国年节及纪念日放假办法》规定的确定事实 */
export const STATUTORY_HOLIDAY_DAYS = 11;

const DAY = 86_400_000;

function expandRange([from, to]: [string, string]): string[] {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const out: string[] = [];
  for (let t = parse(from); t <= parse(to); t += DAY) {
    const dt = new Date(t);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

export interface HolidaySummary {
  year: number;
  official: boolean;
  source: string;
  totalOffDays: number;
  totalMakeupDays: number;
  festivals: Array<{
    name: string;
    offDays: number;
    offDates: string[];
    makeup: string[];
    from: string;
    to: string;
  }>;
  /** 所有放假日（UTC ms 集合），可用于日期引擎跳过 */
  offDateSetMs: Set<number>;
}

export function getHolidaySummary(year: number): HolidaySummary | null {
  const data = HOLIDAY_DATA[year];
  if (!data) return null;
  const toMs = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const festivals = data.festivals.map((f) => {
    const allOff = f.off.flatMap(expandRange);
    return {
      name: f.name,
      offDays: allOff.length,
      offDates: allOff,
      makeup: f.makeup,
      from: f.off[0][0],
      to: f.off[f.off.length - 1][1],
    };
  });
  const offDateSetMs = new Set<number>();
  festivals.forEach((f) => f.offDates.forEach((d) => offDateSetMs.add(toMs(d))));

  return {
    year,
    official: data.official,
    source: data.source,
    totalOffDays: festivals.reduce((s, f) => s + f.offDays, 0),
    totalMakeupDays: festivals.reduce((s, f) => s + f.makeup.length, 0),
    festivals,
    offDateSetMs,
  };
}
