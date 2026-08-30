/**
 * 密码生成器（纯逻辑，crypto 随机，无 Math.random）
 * 设计要点：
 *  1) 用 crypto.getRandomValues 取模避免偏斜（rejection sampling）。
 *  2) 保证"每种已选字符集至少出现一次"，避免"勾了符号却没有符号"。
 *  3) 强度用信息熵（bits = length * log2(poolSize)）量化，而不是拍脑袋"强/弱"。
 */

export interface CharSets {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  symbol: boolean;
}

export const SETS: Record<keyof CharSets, string> = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", // 去掉易混 I O
  lower: "abcdefghijkmnopqrstuvwxyz", // 去掉易混 l
  digit: "23456789", // 去掉易混 0 1
  symbol: "!@#$%^&*()-_=+[]{};:,.?/",
};

export const SETS_FULL: Record<keyof CharSets, string> = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digit: "0123456789",
  symbol: "!@#$%^&*()-_=+[]{};:,.<>?/",
};

function secureRandInt(maxExclusive: number): number {
  // rejection sampling to avoid modulo bias
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % maxExclusive;
}

export interface GenOptions {
  length: number;
  charsets: CharSets;
  excludeAmbiguous: boolean;
}

export function poolFor(charsets: CharSets, excludeAmbiguous: boolean): string {
  const table = excludeAmbiguous ? SETS : SETS_FULL;
  let pool = "";
  (Object.keys(charsets) as Array<keyof CharSets>).forEach((k) => {
    if (charsets[k]) pool += table[k];
  });
  return pool;
}

export function generatePassword(opts: GenOptions): { password: string; error?: string } {
  const { length, charsets, excludeAmbiguous } = opts;
  const selected = (Object.keys(charsets) as Array<keyof CharSets>).filter((k) => charsets[k]);
  if (selected.length === 0) return { password: "", error: "至少选择一种字符类型" };
  if (length < 4) return { password: "", error: "长度至少 4 位" };
  if (length > 128) return { password: "", error: "长度最多 128 位" };

  const table = excludeAmbiguous ? SETS : SETS_FULL;
  const pool = poolFor(charsets, excludeAmbiguous);

  // 先保证每种已选字符集各出现一次
  const chars: string[] = selected.map((k) => {
    const set = table[k];
    return set[secureRandInt(set.length)];
  });
  while (chars.length < length) {
    chars.push(pool[secureRandInt(pool.length)]);
  }
  // Fisher-Yates 洗牌，打散"前几位固定是各类首字符"的模式
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return { password: chars.join("") };
}

export interface Strength {
  bits: number;
  level: "极弱" | "弱" | "中等" | "强" | "非常强";
}

export function evaluateStrength(length: number, poolSize: number): Strength {
  const bits = poolSize > 0 ? Math.round(length * Math.log2(poolSize)) : 0;
  let level: Strength["level"];
  if (bits < 40) level = "极弱";
  else if (bits < 60) level = "弱";
  else if (bits < 80) level = "中等";
  else if (bits < 120) level = "强";
  else level = "非常强";
  return { bits, level };
}
