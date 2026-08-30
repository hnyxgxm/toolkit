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
  /** 数据最后人工核对时间（YYYY-MM），与官方通知逐条核对过，后续年份不预测 */
  lastVerified: string;
  festivals: Festival[];
}

/** 全库数据最后人工核对时间：2026-08 逐条核对国务院办公厅通知 */
export const HOLIDAY_DATA_LAST_VERIFIED = "2026-08";

export const HOLIDAY_DATA: Record<number, HolidayYear> = {
  2025: {
    year: 2025,
    official: true,
    source: "国务院办公厅关于2025年部分节假日安排的通知",
    lastVerified: HOLIDAY_DATA_LAST_VERIFIED,
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
    lastVerified: HOLIDAY_DATA_LAST_VERIFIED,
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
    lastVerified: HOLIDAY_DATA_LAST_VERIFIED, // 2026-08 核对：官方仍未公布
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
  /** 数据最后人工核对时间（YYYY-MM） */
  lastVerified: string;
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
    lastVerified: data.lastVerified,
    totalOffDays: festivals.reduce((s, f) => s + f.offDays, 0),
    totalMakeupDays: festivals.reduce((s, f) => s + f.makeup.length, 0),
    festivals,
    offDateSetMs,
  };
}

/* ==================== 全年月历矩阵（纯函数） ==================== */

export type DayStatus = "off" | "makeup" | "weekend" | "workday";

export interface CalendarCell {
  iso: string;
  day: number;
  /** 0=周日 … 6=周六 */
  weekday: number;
  status: DayStatus;
  /** off / makeup 时所属假期名 */
  festival: string;
  /** 是否为该假期放假区间第一天（用于把节日名标进格子） */
  festivalStart: boolean;
}

export interface MonthGrid {
  year: number;
  /** 1-12 */
  month: number;
  /** 周日起的 7 列网格，首周空位补 null */
  cells: Array<CalendarCell | null>;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoWeekday(iso: string): number {
  return new Date(toUtcMs(iso)).getUTCDay();
}

interface YearIndex {
  off: Map<string, { name: string; start: boolean }>;
  makeup: Map<string, string>;
}

function buildYearIndex(year: number): YearIndex {
  const data = HOLIDAY_DATA[year];
  const off = new Map<string, { name: string; start: boolean }>();
  const makeup = new Map<string, string>();
  if (!data) return { off, makeup };
  for (const f of data.festivals) {
    f.off.forEach((range, ri) => {
      for (const iso of expandRange(range)) {
        off.set(iso, { name: f.name, start: ri === 0 && iso === range[0] });
      }
    });
    for (const m of f.makeup) makeup.set(m, f.name);
  }
  return { off, makeup };
}

function buildMonthGrid(year: number, month: number, index: YearIndex): MonthGrid {
  const first = isoWeekday(`${year}-${pad2(month)}-01`);
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const len = first + total;
  const cells: Array<CalendarCell | null> = [];
  for (let i = 0; i < len; i++) {
    if (i < first) {
      cells.push(null);
      continue;
    }
    const day = i - first + 1;
    const iso = `${year}-${pad2(month)}-${pad2(day)}`;
    const weekday = i % 7;
    let status: DayStatus = weekday === 0 || weekday === 6 ? "weekend" : "workday";
    let festival = "";
    let festivalStart = false;
    const offHit = index.off.get(iso);
    if (offHit) {
      status = "off";
      festival = offHit.name;
      festivalStart = offHit.start;
    } else if (index.makeup.has(iso)) {
      status = "makeup";
      festival = index.makeup.get(iso)!;
    }
    cells.push({ iso, day, weekday, status, festival, festivalStart });
  }
  return { year, month, cells };
}

/** 全年 12 个月的日历状态矩阵（周末 < 补班 < 法定假 的优先级覆盖） */
export function buildYearGrids(year: number): MonthGrid[] {
  const index = buildYearIndex(year);
  return Array.from({ length: 12 }, (_, i) => buildMonthGrid(year, i + 1, index));
}

/** 查某日期所属假期及角色；不属于任何假期返回 null */
export function findFestivalForDate(
  year: number,
  iso: string
): { festival: Festival; role: "off" | "makeup" } | null {
  const data = HOLIDAY_DATA[year];
  if (!data) return null;
  for (const f of data.festivals) {
    if (f.off.some((r) => expandRange(r).includes(iso))) return { festival: f, role: "off" };
    if (f.makeup.includes(iso)) return { festival: f, role: "makeup" };
  }
  return null;
}

/** 「2月15日–2月23日放假共9天，2月14日、2月28日补班」——弹层/读屏都可用的完整描述 */
export function formatFestivalSpan(f: Festival): string {
  const from = f.off[0][0];
  const to = f.off[f.off.length - 1][1];
  const days = f.off.reduce((s, r) => s + expandRange(r).length, 0);
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}月${Number(d)}日`;
  };
  const range = from === to ? fmt(from) : `${fmt(from)}–${fmt(to)}`;
  let out = `${range}放假共${days}天`;
  if (f.makeup.length) out += `，${f.makeup.map(fmt).join("、")}补班`;
  return out;
}

/* ==================== 倒计时（按客户端日期计算，纯函数） ==================== */

export interface HolidayCountdown {
  name: string;
  iso: string;
  /** 0 表示就是今天 */
  days: number;
}

function scanNext(todayIso: string, kind: "off" | "makeup"): HolidayCountdown | null {
  const years = Object.keys(HOLIDAY_DATA)
    .map(Number)
    .sort((a, b) => a - b);
  let best: { name: string; iso: string } | null = null;
  for (const y of years) {
    for (const f of HOLIDAY_DATA[y].festivals) {
      const dates = kind === "off" ? f.off.flatMap(expandRange) : f.makeup;
      for (const iso of dates) {
        if (iso >= todayIso && (!best || iso < best.iso)) best = { name: f.name, iso };
      }
    }
  }
  if (!best) return null;
  return { ...best, days: Math.round((toUtcMs(best.iso) - toUtcMs(todayIso)) / DAY) };
}

/** 距下一个已公布假期（含今天开始的情况） */
export function getNextHoliday(todayIso: string): HolidayCountdown | null {
  return scanNext(todayIso, "off");
}

/** 距下一个已公布补班日 */
export function getNextMakeup(todayIso: string): HolidayCountdown | null {
  return scanNext(todayIso, "makeup");
}

/** 客户端本地时区的今天（YYYY-MM-DD）。SSR 侧不要调用，交给 useEffect 挂载后再取 */
export function getTodayIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* ==================== .ics 导出（纯前端字符串拼装） ==================== */

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function addDays(iso: string, n: number): string {
  return new Date(toUtcMs(iso) + n * DAY).toISOString().slice(0, 10);
}

/** 全年放假+补班导出为 VCALENDAR；未公布年份返回空串（不编造） */
export function buildYearIcs(year: number): string {
  const data = HOLIDAY_DATA[year];
  if (!data || !data.official) return "";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//toolkit//holiday//CN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(`${year}年中国法定节假日`)}`,
  ];
  const stamp = "DTSTAMP:19700101T000000Z";
  for (const f of data.festivals) {
    const desc = icsEscape(`${data.source}（数据核对至 ${data.lastVerified}）`);
    for (const [from, to] of f.off) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${from.replace(/-/g, "")}-${to.replace(/-/g, "")}-off@toolkit`,
        stamp,
        `DTSTART;VALUE=DATE:${from.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${addDays(to, 1).replace(/-/g, "")}`,
        `SUMMARY:${icsEscape(`${f.name}·放假`)}`,
        `DESCRIPTION:${desc}`,
        "END:VEVENT"
      );
    }
    for (const m of f.makeup) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${m.replace(/-/g, "")}-makeup@toolkit`,
        stamp,
        `DTSTART;VALUE=DATE:${m.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${addDays(m, 1).replace(/-/g, "")}`,
        `SUMMARY:${icsEscape(`${f.name}·补班`)}`,
        `DESCRIPTION:${desc}`,
        "END:VEVENT"
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
