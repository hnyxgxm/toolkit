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

/* ============================================================
 * 以下为第二轮「视觉+交互重做」新增的纯函数（同样保持无副作用）
 * ============================================================ */

/** 闰年判定（格里高利历：4 年一闰，百年不闰，四百年再闰） */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某月天数（month0: 0=一月 .. 11=十二月），UTC 日历 */
export function daysInMonthUTC(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** 年内第 N 天（1 起，按 UTC 日历日） */
export function dayOfYear(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  return Math.floor((ms - Date.UTC(y, 0, 1)) / DAY) + 1;
}

/** 平移 N 天（可为负），非法入参返回 null */
export function shiftISO(s: string, days: number): string | null {
  const ms = parseISO(s);
  if (ms === null) return null;
  return toISO(ms + days * DAY);
}

/** 当月迷你日历矩阵：周一为首列（对齐 ISO 周），null 为留白格 */
export function monthMatrix(year: number, month1: number): (string | null)[][] {
  const first = Date.UTC(year, month1 - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7; // Mon=0
  const dim = daysInMonthUTC(year, month1 - 1);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push(toISO(Date.UTC(year, month1 - 1, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export interface WeekdayInfo {
  iso: string;
  /** 星期几中文，如「星期四」 */
  cn: string;
  /** 0=周日 .. 6=周六 */
  wdIndex: number;
  isWeekend: boolean;
  /** 年内第 N 天（1 起） */
  dayOfYear: number;
  isoWeekWeek: number;
  isoWeekFrom: string;
  isoWeekTo: string;
  year: number;
  isLeap: boolean;
}

/** 聚合星期查询的全部派生信息；非法日期返回 null */
export function weekdayInfo(iso: string): WeekdayInfo | null {
  const ms = parseISO(iso);
  if (ms === null) return null;
  const dt = new Date(ms);
  const wd = dt.getUTCDay();
  const year = dt.getUTCFullYear();
  const w = isoWeek(ms);
  return {
    iso,
    cn: WEEKDAY_CN[wd],
    wdIndex: wd,
    isWeekend: wd === 0 || wd === 6,
    dayOfYear: dayOfYear(ms),
    isoWeekWeek: w.week,
    isoWeekFrom: w.from,
    isoWeekTo: w.to,
    year,
    isLeap: isLeapYear(year),
  };
}

/** 多行批量星期查询：忽略空行，逐行回显原始输入 */
export function weekdayInfoLines(text: string): Array<{ raw: string; info: WeekdayInfo | null }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((raw) => ({ raw, info: weekdayInfo(raw) }));
}

export interface DurationUnits {
  /** 整年数（日历精确） */
  years: number;
  /** 剩余整月数（日历精确） */
  months: number;
  /** 剩余天数（日历精确） */
  days: number;
  /** 总天数（与 diffDates 同口径） */
  totalDays: number;
  /** 整周数 = floor(totalDays / 7) */
  weeks: number;
  /** 余数天 = totalDays % 7 */
  weekRemainder: number;
}

/** 拆出 UTC 日历的年月日部分 */
function isoParts(ms: number): { y: number; m: number; d: number } {
  const [y, m, d] = toISO(ms).split("-").map(Number);
  return { y, m, d };
}

/**
 * 多单位时长拆解：天 / 周 / 年·月·日。
 * inclusive（含尾日）时按「结束日 + 1 天」计算，与 diffDates 的 totalDays 恒一致；
 * exclusive 时按「不含结束日」计算。月按日历口径（不足一月按天借位，月末按当月实际天数收敛）。
 * 非法或结束早于起始返回 null。
 */
export function diffUnits(startStr: string, endStr: string, mode: RangeMode): DurationUnits | null {
  const s = parseISO(startStr);
  const e = parseISO(endStr);
  if (s === null || e === null || e < s) return null;
  const effEnd = mode === "inclusive" ? e + DAY : e;

  const se = isoParts(s);
  const ee = isoParts(effEnd);
  let months = (ee.y * 12 + ee.m) - (se.y * 12 + se.m);
  if (ee.d < se.d) months -= 1;
  const years = Math.floor(months / 12);
  const restMonths = months - years * 12;

  // 锚点：起始日 + months（月末溢出时收敛到当月最后一天，如 1-31 + 1 月 → 2-28/29）
  const anchorY = se.y + Math.floor((se.m - 1 + months) / 12);
  const anchorM0 = (((se.m - 1 + months) % 12) + 12) % 12;
  const anchor = Date.UTC(anchorY, anchorM0, Math.min(se.d, daysInMonthUTC(anchorY, anchorM0)));

  const totalDays = Math.round((effEnd - s) / DAY);
  return {
    years,
    months: restMonths,
    days: Math.round((effEnd - anchor) / DAY),
    totalDays,
    weeks: Math.floor(totalDays / 7),
    weekRemainder: totalDays % 7,
  };
}

/** 中文拼接年/月/日，前导零单位省略，全零为「0 天」 */
export function formatDurationCN(u: Pick<DurationUnits, "years" | "months" | "days">): string {
  const parts: string[] = [];
  if (u.years > 0) parts.push(`${u.years} 年`);
  if (u.months > 0) parts.push(`${u.months} 个月`);
  if (u.days > 0 || parts.length === 0) parts.push(`${u.days} 天`);
  return parts.join(" ");
}

/** 「X 周 Y 天」 */
export function formatWeeksCN(u: Pick<DurationUnits, "weeks" | "weekRemainder">): string {
  return `${u.weeks} 周 ${u.weekRemainder} 天`;
}
