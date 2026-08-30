/**
 * 日期引擎（纯函数，无副作用，可单测）
 *
 * 设计要点：修复线上"日期差值"的边界口径不一致 bug。
 * 旧实现里 总天数=按不含结束日、工作日=按含两端、周末=总天数-工作日，
 * 导致跨年少 1 天、极端区间周末出现负数。
 * 新实现强制：三个数值在同一种 `RangeMode` 语义下计算，且恒满足
 *   totalDays = workdays + weekendDays   （周末永不为负）
 */

export type RangeMode = "inclusive" | "exclusive"; // inclusive=含首尾, exclusive=含首不含尾

/** 解析 YYYY-MM-DD 为 UTC 毫秒，避免时区漂移；非法返回 null */
export function parseISO(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  // 回读校验，排除 2025-02-30 这类
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t;
}

export function toISO(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

const DAY = 86_400_000;

/** 返回区间内的日期序列（UTC ms），按 mode 决定是否含结束日 */
export function rangeDays(startMs: number, endMs: number, mode: RangeMode): number[] {
  const last = mode === "inclusive" ? endMs : endMs - DAY;
  const out: number[] = [];
  for (let t = startMs; t <= last; t += DAY) out.push(t);
  return out;
}

/** 是否为周末（周六/周日）。weekday: 0=Sun..6=Sat */
export function isWeekend(ms: number): boolean {
  const wd = new Date(ms).getUTCDay();
  return wd === 0 || wd === 6;
}

const WEEKDAY_CN = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
export function weekdayCN(s: string): string | null {
  const t = parseISO(s);
  if (t === null) return null;
  return WEEKDAY_CN[new Date(t).getUTCDay()];
}

export interface DateDiff {
  ok: boolean;
  error?: string;
  totalDays: number;
  workdays: number;
  weekendDays: number;
  /** ISO 8601 周数与本周区间 */
  startWeek: { week: number; from: string; to: string };
  endWeek: { week: number; from: string; to: string };
}

/** ISO 8601 周数 */
export function isoWeek(ms: number): { week: number; from: string; to: string } {
  const dt = new Date(ms);
  const dayNum = (dt.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(ms - dayNum * DAY + 3 * DAY);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY / 7) + 1;
  const from = ms - dayNum * DAY;
  const to = from + 6 * DAY;
  return { week, from: toISO(from), to: toISO(to) };
}

/**
 * 计算两个日期之差。
 * @param skipHolidays 传入休息日集合（毫秒）则工作日会跳过它们（用于结合节假日数据）
 */
export function diffDates(
  startStr: string,
  endStr: string,
  mode: RangeMode,
  skipHolidays: Set<number> = new Set(),
): DateDiff {
  const s = parseISO(startStr);
  const e = parseISO(endStr);
  const empty: DateDiff = {
    ok: false, totalDays: 0, workdays: 0, weekendDays: 0,
    startWeek: { week: 0, from: "", to: "" }, endWeek: { week: 0, from: "", to: "" },
  };
  if (s === null || e === null) return { ...empty, error: "请输入有效的起始与结束日期" };
  if (e < s) return { ...empty, error: "结束日期不能早于起始日期" };

  const days = rangeDays(s, e, mode);
  let work = 0;
  let weekend = 0;
  for (const d of days) {
    if (isWeekend(d) || skipHolidays.has(d)) weekend += 1;
    else work += 1;
  }
  return {
    ok: true,
    totalDays: days.length,
    workdays: work,
    weekendDays: weekend,
    startWeek: isoWeek(s),
    endWeek: isoWeek(e),
  };
}

/**
 * 从某日期起加减 N 个工作日（跳过周末，可选跳过节假日）。
 * n>0 向前，n<0 向后。结果含起始日的处理：起始日若为工作日计为第 0 天。
 */
export function addWorkdays(
  startStr: string,
  n: number,
  skipHolidays: Set<number> = new Set(),
): { ok: boolean; error?: string; result?: string; direction: "forward" | "backward" | "none" } {
  const s = parseISO(startStr);
  if (s === null) return { ok: false, error: "请输入有效日期", direction: "none" };
  const dir = n > 0 ? 1 : n < 0 ? -1 : 0;
  if (dir === 0) return { ok: true, result: startStr, direction: "none" };
  let t = s;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    t += dir * DAY;
    if (!isWeekend(t) && !skipHolidays.has(t)) remaining -= 1;
  }
  return { ok: true, result: toISO(t), direction: n > 0 ? "forward" : "backward" };
}
