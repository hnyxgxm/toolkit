/**
 * 密码生成器（纯逻辑，crypto 随机，无 Math.random）
 * 设计要点：
 *  1) crypto.getRandomValues + rejection sampling 避免取模偏斜；随机源通过 rng 参数注入，便于确定性单测。
 *  2) 随机密码保证"每种已选字符集至少出现一次"；口令短语内嵌 128 词表（恰好 7 bit/词），4–6 词组合。
 *  3) 强度为本地简化启发式（非 zxcvbn 精度）：字符集熵 + 重复字符惩罚 + 常见弱口令词惩罚，
 *     输出 0–4 档 + 有效熵 bits + 双口径防猜测时间（在线 10^4 次/秒 vs 离线 10^10 次/秒）。
 *  4) 词表仅供本地口令组合与启发式判断，无任何网络请求。
 */

export interface CharSets {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  symbol: boolean;
}

/** 排除易混字符（i l 1 L o 0 O）后的字符集 */
export const SETS: Record<keyof CharSets, string> = {
  upper: "ABCDEFGHJKMNPQRSTUVWXYZ", // 去掉易混 I L O
  lower: "abcdefghjkmnpqrstuvwxyz", // 去掉易混 i l o
  digit: "23456789", // 去掉易混 0 1
  symbol: "!@#$%^&*()-_=+[]{};:,.?/",
};

export const SETS_FULL: Record<keyof CharSets, string> = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digit: "0123456789",
  symbol: "!@#$%^&*()-_=+[]{};:,.<>?/",
};

/* ---------------- 随机源（可注入） ---------------- */

/** 随机整数源：返回 [0, maxExclusive) 内的整数；默认用 crypto.getRandomValues */
export type RandomInt = (maxExclusive: number) => number;

function secureRandomInt(maxExclusive: number): number {
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

/* ---------------- 随机密码 ---------------- */

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

export function generatePassword(opts: GenOptions, rng: RandomInt = secureRandomInt): { password: string; error?: string } {
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
    return set[rng(set.length)];
  });
  while (chars.length < length) {
    chars.push(pool[rng(pool.length)]);
  }
  // Fisher-Yates 洗牌，打散"前几位固定是各类首字符"的模式
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return { password: chars.join("") };
}

/* ---------------- 口令短语（passphrase） ---------------- */

/** 口令短语词表：128 个常用英文单词（恰好 2^7=128，每词 7 bit 熵），小写、3–6 字母、无重复 */
export const PASSPHRASE_WORDS: readonly string[] = [
  "apple", "beach", "brave", "candle", "cherry", "cloud", "coral", "dance",
  "dream", "eagle", "earth", "field", "flame", "forest", "frost", "garden",
  "gold", "grape", "green", "harbor", "honey", "horse", "island", "jade",
  "jazz", "kiwi", "lemon", "light", "lucky", "mango", "maple", "marble",
  "meadow", "melon", "mint", "moon", "mouse", "music", "night", "noble",
  "north", "ocean", "olive", "orange", "otter", "owl", "panda", "party",
  "peach", "pearl", "piano", "pilot", "pine", "planet", "plum", "polar",
  "pond", "poppy", "rain", "river", "robin", "rocket", "rose", "ruby",
  "sail", "salmon", "sand", "sunset", "silk", "silver", "sky", "slate",
  "snow", "solar", "song", "spark", "spice", "spring", "star", "storm",
  "sugar", "summer", "sun", "sweet", "swift", "tiger", "toast", "torch",
  "tower", "trail", "tulip", "turtle", "violet", "wave", "whale", "wheat",
  "basil", "berry", "birch", "bloom", "breeze", "butter", "cactus", "camel",
  "canyon", "cedar", "clover", "comet", "copper", "cosmos", "cotton", "crown",
  "dawn", "delta", "dune", "ember", "fern", "fjord", "fox", "gem",
  "hazel", "iris", "ivy", "lotus", "lynx", "nectar", "onyx", "zephyr",
];

export interface PassphraseOptions {
  /** 单词数量，4–6 */
  words: number;
  /** 词间分隔符（≤3 字符） */
  separator: string;
  /** 每个词首字母大写 */
  capitalize: boolean;
  /** 末尾附加两位随机数字 */
  addNumber: boolean;
}

export function generatePassphrase(
  opts: PassphraseOptions,
  rng: RandomInt = secureRandomInt
): { passphrase: string; error?: string } {
  const words = Math.floor(Number(opts.words));
  if (!Number.isFinite(words) || words < 4 || words > 6) {
    return { passphrase: "", error: "口令词数需在 4–6 之间" };
  }
  const sep = String(opts.separator ?? "-").slice(0, 3);
  const picked: string[] = [];
  for (let i = 0; i < words; i++) {
    let w = PASSPHRASE_WORDS[rng(PASSPHRASE_WORDS.length)];
    if (opts.capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
    picked.push(w);
  }
  let passphrase = picked.join(sep);
  if (opts.addNumber) {
    passphrase += sep + String(rng(100)).padStart(2, "0");
  }
  return { passphrase };
}

/* ---------------- 强度评估（本地简化启发式，非 zxcvbn 精度） ---------------- */

/** 在线限速场景：攻击者每秒 1 万次尝试 */
export const ONLINE_GUESSES_PER_SEC = 10_000;
/** 离线 GPU 集群场景：攻击者每秒 100 亿次尝试 */
export const OFFLINE_GUESSES_PER_SEC = 10_000_000_000;

/** 符号字符池估算大小（常见可打印符号） */
const SYMBOL_POOL_SIZE = 32;

/** 常见弱口令表：出现在密码中（子串命中）即重罚 */
const COMMON_PASSWORDS: readonly string[] = [
  "password", "passw0rd", "123456", "12345678", "123456789", "123123",
  "qwerty", "abc123", "111111", "000000", "121212", "654321",
  "admin", "letmein", "welcome", "monkey", "dragon", "football",
  "iloveyou", "princess", "sunshine", "master", "hello", "freedom",
  "whatever", "superman", "trustno1", "qazwsx", "asdfgh", "zxcvbnm",
  "1q2w3e4r", "qwertyuiop",
];

export type StrengthScore = 0 | 1 | 2 | 3 | 4;
export type StrengthLabel = "极弱" | "弱" | "中等" | "强" | "非常强";

export interface StrengthResult {
  /** 0–4 档 */
  score: StrengthScore;
  label: StrengthLabel;
  /** 修正后的有效熵（bit） */
  bits: number;
  /** 纯字符集熵（bit），未做惩罚 */
  rawBits: number;
  /** 防猜测时间：在线（10^4 次/秒）与离线（10^10 次/秒）两档 */
  crackTime: { online: string; offline: string };
  /** 启发式发现的风险提示 */
  warnings: string[];
}

/** 有效熵 → 0–4 档映射（阈值参照 zxcvbn 的粗略分档，简化口径） */
export function scoreFromBits(bits: number): { score: StrengthScore; label: StrengthLabel } {
  if (bits < 24) return { score: 0, label: "极弱" };
  if (bits < 36) return { score: 1, label: "弱" };
  if (bits < 60) return { score: 2, label: "中等" };
  if (bits < 85) return { score: 3, label: "强" };
  return { score: 4, label: "非常强" };
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 31_557_600; // 365.25 天
/** 宇宙年龄约 138 亿年 */
const AGE_OF_UNIVERSE_YEARS = 1.38e10;

/** 把秒数格式化为中文可读时长（纯函数，供两档口径复用） */
export function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1) return "不到 1 秒";
  if (seconds < SECONDS_PER_MINUTE) return `${Math.round(seconds)} 秒`;
  if (seconds < SECONDS_PER_HOUR) return `${Math.round(seconds / SECONDS_PER_MINUTE)} 分钟`;
  if (seconds < SECONDS_PER_DAY) return `${Math.round(seconds / SECONDS_PER_HOUR)} 小时`;
  if (seconds < SECONDS_PER_YEAR) return `${Math.round(seconds / SECONDS_PER_DAY)} 天`;
  const years = seconds / SECONDS_PER_YEAR;
  if (years > AGE_OF_UNIVERSE_YEARS) return "超过宇宙年龄";
  if (years < 1e4) return `${Math.round(years)} 年`;
  if (years < 1e8) return `${Math.round(years / 1e4)} 万年`;
  return `${Math.round(years / 1e8)} 亿年`;
}

function crackTimeText(bits: number, guessesPerSec: number): string {
  // 平均需尝试一半搜索空间：2^(bits-1) 次
  const guesses = Math.pow(2, Math.max(bits - 1, 0));
  return formatCrackTime(guesses / guessesPerSec);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 本地简化强度估算（非 zxcvbn 精度，仅供参考）：
 *  1) 字符集熵 = 长度 × log2(实际命中的字符池)；
 *  2) 口令短语结构检测：所有字母段均为词表词（≥3 段）→ 按词表熵重算（7 bit/词 + 数字/大写加成）；
 *  3) 重复字符惩罚：唯一字符占比越低熵越低；几乎全同字符时直接封顶为极弱；
 *  4) 常见弱口令子串惩罚：命中即扣 30 bit，整串等于弱口令时封顶 6 bit。
 */
export function estimateStrength(password: string): StrengthResult {
  const pw = String(password ?? "");
  const len = pw.length;
  if (len === 0) {
    return {
      score: 0, label: "极弱", bits: 0, rawBits: 0,
      crackTime: { online: "不到 1 秒", offline: "不到 1 秒" },
      warnings: ["密码为空"],
    };
  }
  const warnings: string[] = [];

  // 1) 字符集熵
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += SYMBOL_POOL_SIZE;
  const rawBits = len * Math.log2(pool || 1);
  let bits = rawBits;

  // 2) 口令短语结构：按非字母数字切段 + 驼峰大写处再切，全部命中词表则按词表熵计
  const letterTokens: string[] = [];
  for (const token of pw.split(/[^a-zA-Z0-9]+/)) {
    if (!token) continue;
    if (/^[a-zA-Z]+$/.test(token)) {
      for (const part of token.split(/(?=[A-Z])/)) {
        const lo = part.toLowerCase();
        if (lo) letterTokens.push(lo);
      }
    }
  }
  const isPhrase =
    letterTokens.length >= 3 && letterTokens.every((t) => PASSPHRASE_WORDS.includes(t)) && len >= 12;
  if (isPhrase) {
    const distinct = new Set(letterTokens).size;
    bits = distinct * Math.log2(PASSPHRASE_WORDS.length) + (letterTokens.length - distinct) * 2;
    if (/\d/.test(pw)) bits += 6; // 含附加数字段
    if (/[A-Z]/.test(pw)) bits += 2; // 含大写形态变化
    const { score, label } = scoreFromBits(bits);
    return {
      score, label, bits: round2(bits), rawBits: round2(rawBits),
      crackTime: {
        online: crackTimeText(bits, ONLINE_GUESSES_PER_SEC),
        offline: crackTimeText(bits, OFFLINE_GUESSES_PER_SEC),
      },
      warnings: distinct < letterTokens.length ? ["存在重复单词，实际熵低于词数表面值"] : [],
    };
  }

  // 3) 重复字符惩罚
  const unique = new Set(pw).size;
  const ratio = unique / len;
  if (ratio < 0.75) {
    bits *= ratio / 0.75;
    warnings.push("重复字符较多，实际熵低于表面长度");
  }
  if (len >= 6 && unique <= 3) {
    bits = Math.min(bits, 10);
    warnings.push("几乎全由相同字符组成，极易被暴力破解");
  }

  // 4) 常见弱口令子串惩罚（去掉被更长命中包含的短命中，避免重复计费）
  const norm = pw.toLowerCase();
  const hits = COMMON_PASSWORDS.filter((w) => norm.includes(w));
  const maximal = hits.filter((w) => !hits.some((o) => o !== w && o.length > w.length && o.includes(w)));
  if (maximal.length > 0) {
    bits -= 30 * maximal.length;
    if (maximal.some((w) => norm === w)) bits = Math.min(bits, 6);
    warnings.push(`包含常见弱口令「${maximal.join("、")}」，易被字典攻击`);
  }

  bits = Math.max(0, bits);
  const { score, label } = scoreFromBits(bits);
  return {
    score, label, bits: round2(bits), rawBits: round2(rawBits),
    crackTime: {
      online: crackTimeText(bits, ONLINE_GUESSES_PER_SEC),
      offline: crackTimeText(bits, OFFLINE_GUESSES_PER_SEC),
    },
    warnings,
  };
}
