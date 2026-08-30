import { describe, it, expect } from "vitest";
import {
  parseTimestamp,
  parseTimestampLines,
  parseLocalInput,
  fmtLocal,
  fmtUTC,
  iso8601,
  relativeTimeCN,
  toLocalInputValue,
} from "@/lib/timestamp";

describe("timestamp engine", () => {
  it("auto-detects 10-digit seconds and 13-digit milliseconds", () => {
    const s = parseTimestamp("1700000000");
    expect(s).toEqual({ ok: true, ms: 1_700_000_000_000, unit: "s" });
    const ms = parseTimestamp("1700000000000");
    expect(ms).toEqual({ ok: true, ms: 1_700_000_000_000, unit: "ms" });
    // 不变式：同一时刻的秒/毫秒表达解析出相同 ms
    expect(s.ok && ms.ok ? s.ms === ms.ms : false).toBe(true);
  });

  it("trims whitespace and treats 1~12 digits as seconds", () => {
    expect(parseTimestamp("  1700000000  ")).toEqual({ ok: true, ms: 1_700_000_000_000, unit: "s" });
    expect(parseTimestamp("99999999999")).toEqual({ ok: true, ms: 99_999_999_999_000, unit: "s" });
  });

  it("rejects non-numeric, negative, empty and overflowing input", () => {
    expect(parseTimestamp("").ok).toBe(false);
    expect(parseTimestamp("12a3").ok).toBe(false);
    expect(parseTimestamp("-1700000000").ok).toBe(false);
    expect(parseTimestamp("1700000000.5").ok).toBe(false);
    expect(parseTimestamp("9".repeat(17)).ok).toBe(false); // 超长
    expect(parseTimestamp("9".repeat(16)).ok).toBe(false); // 超出安全整数范围
  });

  it("parseTimestampLines skips empty lines and echoes raw input", () => {
    const rows = parseTimestampLines("1700000000\n\n  abc  \n1700000000000\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.raw).toBe("1700000000");
    expect(rows[0]!.parsed).toEqual({ ok: true, ms: 1_700_000_000_000, unit: "s" });
    expect(rows[1]!.raw).toBe("abc");
    expect(rows[1]!.parsed.ok).toBe(false);
    expect(rows[2]!.parsed).toEqual({ ok: true, ms: 1_700_000_000_000, unit: "ms" });
  });

  it("parseLocalInput handles native picker values and rejects garbage", () => {
    expect(parseLocalInput("")).toBeNull();
    expect(parseLocalInput("nope")).toBeNull();
    const t = parseLocalInput("2026-01-01T12:30");
    expect(t).not.toBeNull();
    // 往返不变式：控件值 → 毫秒 → 控件值 恒等（无秒/毫秒损失）
    expect(toLocalInputValue(t!)).toBe("2026-01-01T12:30");
  });

  it("fmtUTC formats in UTC regardless of runtime timezone", () => {
    expect(fmtUTC(Date.UTC(2026, 0, 1, 7, 8, 9))).toBe("2026-01-01 07:08:09");
    expect(fmtUTC(Date.UTC(1999, 11, 31, 23, 59, 59))).toBe("1999-12-31 23:59:59");
  });

  it("iso8601 is always Z-suffixed", () => {
    expect(iso8601(Date.UTC(2026, 0, 1))).toBe("2026-01-01T00:00:00.000Z");
  });

  it("fmtLocal matches the runtime timezone composition", () => {
    // 以运行时时区独立的方式校验：手动拼装同一 Date 的本地字段
    const ms = Date.UTC(2026, 0, 1, 12, 34, 56);
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    const expected = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    expect(fmtLocal(ms)).toBe(expected);
    expect(fmtLocal(ms)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("relativeTimeCN covers 秒/分钟/小时/天/月/年 with 前/后 suffixes", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(relativeTimeCN(now, now)).toBe("刚刚");
    expect(relativeTimeCN(now - 5_000, now)).toBe("刚刚"); // <10s
    expect(relativeTimeCN(now - 30_000, now)).toBe("30 秒前");
    expect(relativeTimeCN(now + 59_000, now)).toBe("59 秒后");
    expect(relativeTimeCN(now - 90_000, now)).toBe("1 分钟前");
    expect(relativeTimeCN(now - 2 * 3_600_000, now)).toBe("2 小时前");
    expect(relativeTimeCN(now - 3 * 86_400_000, now)).toBe("3 天前");
    expect(relativeTimeCN(now + 5 * 86_400_000, now)).toBe("5 天后");
    expect(relativeTimeCN(now - 45 * 86_400_000, now)).toBe("1 个月前");
    expect(relativeTimeCN(now + 60 * 86_400_000, now)).toBe("2 个月后");
    expect(relativeTimeCN(now - 400 * 86_400_000, now)).toBe("1 年前");
    expect(relativeTimeCN(now + 800 * 86_400_000, now)).toBe("2 年后");
  });
});
