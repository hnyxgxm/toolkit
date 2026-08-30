/**
 * 时间戳引擎（纯函数，无副作用，可单测）
 *
 * 识别口径（对齐 epochconverter 惯例）：
 * - 纯数字长度 1~12 位 → 按「秒」处理（×1000）
 * - 纯数字长度 ≥13 位   → 按「毫秒」处理
 * - 只接受非负整数；溢出安全整数范围拒绝
 *
 * 格式化口径：
 * - fmtLocal 依赖运行时时区（浏览器本地），fmtUTC / iso8601 恒为 UTC
 * - relativeTimeCN 注入 nowMs，保证可测且无隐式时钟
 */

export type TimestampParse =
  | { ok: true; ms: number; unit: "s" | "ms" }
  | { ok: false; error: string };

/** 单个时间戳解析：自动识别 10/13 位（1~12 位按秒，≥13 位按毫秒） */
export function parseTimestamp(raw: string): TimestampParse {
  const s = raw.trim();
  if (!/^\d{1,16}$/.test(s)) {
    return { ok: false, error: "时间戳应为纯数字（10 位秒 / 13 位毫秒）" };
  }
  const num = Number(s);
  const isMs = s.length >= 13;
  const ms = isMs ? num : num * 1000;
  if (!Number.isSafeInteger(ms)) {
    return { ok: false, error: "时间戳超出安全整数范围" };
  }
  return { ok: true, ms, unit: isMs ? "ms" : "s" };
}

export interface TimestampLine {
  raw: string;
  parsed: TimestampParse;
}

/** 多行批量解析：忽略空行，逐行回显原始输入 */
export function parseTimestampLines(text: string): TimestampLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((raw) => ({ raw, parsed: parseTimestamp(raw) }));
}

/** datetime-local / date 原生控件值 → 本地时区毫秒；空或非法返回 null */
export function parseLocalInput(s: string): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** 本地时区 "YYYY-MM-DD HH:mm:ss" */
export function fmtLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** UTC "YYYY-MM-DD HH:mm:ss" */
export function fmtUTC(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** ISO 8601（恒为 Z 结尾） */
export function iso8601(ms: number): string {
  return new Date(ms).toISOString();
}

/** 相对时间，如「3 天前」「2 小时后」；nowMs 显式注入保证纯函数可测 */
export function relativeTimeCN(ms: number, nowMs: number): string {
  const diffSec = Math.round((ms - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  const suffix = diffSec < 0 ? "前" : "后";
  if (abs < 10) return "刚刚";
  if (abs < 60) return `${abs} 秒${suffix}`;
  if (abs < 3600) return `${Math.floor(abs / 60)} 分钟${suffix}`;
  if (abs < 86_400) return `${Math.floor(abs / 3600)} 小时${suffix}`;
  const d = Math.floor(abs / 86_400);
  if (d < 30) return `${d} 天${suffix}`;
  if (d < 365) return `${Math.floor(d / 30)} 个月${suffix}`;
  return `${Math.floor(d / 365)} 年${suffix}`;
}

/** 毫秒 → datetime-local 控件值（本地时区 "YYYY-MM-DDTHH:mm"），供回填选择器 */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
