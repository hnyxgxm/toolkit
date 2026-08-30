import { describe, it, expect } from "vitest";
import {
  generatePassword,
  generatePassphrase,
  estimateStrength,
  formatCrackTime,
  poolFor,
  scoreFromBits,
  PASSPHRASE_WORDS,
  ONLINE_GUESSES_PER_SEC,
  OFFLINE_GUESSES_PER_SEC,
  type RandomInt,
} from "@/lib/password";

describe("password generator", () => {
  it("guarantees every selected class appears (no empty class)", () => {
    for (let i = 0; i < 50; i++) {
      const { password } = generatePassword({ length: 8, charsets: { upper: true, lower: true, digit: true, symbol: true }, excludeAmbiguous: false });
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/\d/.test(password)).toBe(true);
      expect(/[^A-Za-z0-9]/.test(password)).toBe(true);
    }
  });

  it("respects length and rejects invalid config", () => {
    expect(generatePassword({ length: 24, charsets: { upper: true, lower: true, digit: false, symbol: false }, excludeAmbiguous: true }).password).toHaveLength(24);
    expect(generatePassword({ length: 16, charsets: { upper: false, lower: false, digit: false, symbol: false }, excludeAmbiguous: false }).error).toBeTruthy();
    expect(generatePassword({ length: 2, charsets: { upper: true, lower: true, digit: true, symbol: true }, excludeAmbiguous: false }).error).toBeTruthy();
  });

  it("excludeAmbiguous removes confusable chars (il1Lo0O) from pool", () => {
    const amb = poolFor({ upper: true, lower: true, digit: true, symbol: false }, false);
    const noAmb = poolFor({ upper: true, lower: true, digit: true, symbol: false }, true);
    expect(amb).toContain("0");
    expect(noAmb).not.toMatch(/[il1Lo0O]/);
    expect(noAmb.length).toBeLessThan(amb.length);
  });

  it("defaults to crypto.getRandomValues and accepts an injectable rng for determinism", () => {
    // 默认随机源可用（Node 18+ 自带 webcrypto），生成落在合法字符池内
    const { password, error } = generatePassword({ length: 12, charsets: { upper: true, lower: true, digit: true, symbol: false }, excludeAmbiguous: true });
    expect(error).toBeUndefined();
    expect(password).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]{12}$/);

    // 注入固定随机源：同一序列生成结果完全一致（可复现）；rng 遵守 maxExclusive 边界
    const makeRng = (): RandomInt => {
      let n = 0;
      return (max: number) => {
        n = (n + 7) % 97;
        return n % max;
      };
    };
    const a = generatePassword({ length: 10, charsets: { upper: true, lower: true, digit: true, symbol: true }, excludeAmbiguous: false }, makeRng()).password;
    const b = generatePassword({ length: 10, charsets: { upper: true, lower: true, digit: true, symbol: true }, excludeAmbiguous: false }, makeRng()).password;
    expect(a).toBe(b);
  });
});

describe("passphrase", () => {
  it("embeds exactly 128 unique lowercase words of 3-6 letters (7 bit each)", () => {
    expect(PASSPHRASE_WORDS).toHaveLength(128);
    expect(new Set(PASSPHRASE_WORDS).size).toBe(128);
    for (const w of PASSPHRASE_WORDS) expect(w).toMatch(/^[a-z]{3,6}$/);
  });

  it("generates 4-6 word combos with separator / capitalization / number options", () => {
    const makeRng = (): RandomInt => {
      let n = 0;
      return (max: number) => {
        n = (n + 11) % 128;
        return n % max;
      };
    };
    const { passphrase, error } = generatePassphrase(
      { words: 5, separator: "-", capitalize: true, addNumber: false },
      makeRng()
    );
    expect(error).toBeUndefined();
    const parts = passphrase.split("-");
    expect(parts).toHaveLength(5);
    for (const p of parts) {
      expect(PASSPHRASE_WORDS).toContain(p.toLowerCase());
      expect(p[0]).toMatch(/[A-Z]/);
    }

    // 词数越界报错
    expect(generatePassphrase({ words: 3, separator: "-", capitalize: false, addNumber: false }, () => 0).error).toBeTruthy();
    expect(generatePassphrase({ words: 7, separator: "-", capitalize: false, addNumber: false }, () => 0).error).toBeTruthy();

    // 附加数字 + 确定性：rng 恒 0 → 全部取第 1 个词 + "00"
    const fixed = generatePassphrase({ words: 4, separator: "_", capitalize: false, addNumber: true }, () => 0).passphrase;
    expect(fixed).toBe("apple_apple_apple_apple_00");
  });
});

describe("strength estimation (local simplified heuristic, not zxcvbn)", () => {
  it("rates weak / dictionary passwords low", () => {
    expect(estimateStrength("password").score).toBeLessThanOrEqual(1);
    expect(estimateStrength("123456").score).toBe(0);
    expect(estimateStrength("qwerty12345").score).toBeLessThanOrEqual(1);
    expect(estimateStrength("").score).toBe(0);
  });

  it("rates long random passwords high", () => {
    const strong = estimateStrength("Kx9$mQ2vLp4#wZ8r");
    expect(strong.score).toBeGreaterThanOrEqual(3);
    expect(strong.bits).toBeGreaterThan(80);
    expect(estimateStrength("t5W!pQ8zR@2kV#6mX&9d").score).toBe(4);
  });

  it("rates a 5-6 word passphrase moderate (not weak, not max)", () => {
    const makeRng = (step: number): RandomInt => {
      let n = 0;
      return (max: number) => {
        n = (n + step) % 128;
        return n % max;
      };
    };
    const five = generatePassphrase({ words: 5, separator: "-", capitalize: true, addNumber: false }, makeRng(11)).passphrase;
    const sf = estimateStrength(five);
    expect(sf.score).toBe(2);
    expect(sf.bits).toBeGreaterThanOrEqual(36);
    expect(sf.bits).toBeLessThan(60);

    const six = generatePassphrase({ words: 6, separator: ".", capitalize: true, addNumber: true }, makeRng(13)).passphrase;
    const ss = estimateStrength(six);
    expect(ss.score).toBeGreaterThanOrEqual(2);
    expect(ss.score).toBeLessThanOrEqual(3);
  });

  it("penalizes heavy repetition", () => {
    const rep = estimateStrength("aaaaaaaa");
    expect(rep.score).toBe(0);
    expect(rep.bits).toBeLessThan(12);
    expect(rep.warnings.length).toBeGreaterThan(0);
    expect(rep.bits).toBeLessThan(estimateStrength("a1b2c3d4").bits);
  });

  it("reports 0-4 tiers and two-tier crack times (online 1e4/s vs offline 1e10/s)", () => {
    expect(ONLINE_GUESSES_PER_SEC).toBe(1e4);
    expect(OFFLINE_GUESSES_PER_SEC).toBe(1e10);

    for (let bits = 0; bits <= 130; bits += 10) {
      const { score } = scoreFromBits(bits);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
    expect(scoreFromBits(10).score).toBe(0);
    expect(scoreFromBits(30).score).toBe(1);
    expect(scoreFromBits(50).score).toBe(2);
    expect(scoreFromBits(70).score).toBe(3);
    expect(scoreFromBits(90).score).toBe(4);

    // 8 位混合随机：在线口径撑近万年、离线口径仅数天，两档必须拉开差距
    const mid = estimateStrength("xK9$mQ2v");
    expect(mid.crackTime.online).toContain("年");
    expect(mid.crackTime.offline).toMatch(/秒|分钟|小时|天/);
    expect(mid.crackTime.online).not.toBe(mid.crackTime.offline);

    // 16 位混合随机：离线口径也已超过宇宙年龄
    const strong = estimateStrength("Kx9$mQ2vLp4#wZ8r");
    expect(strong.crackTime.offline).toContain("宇宙年龄");
    expect(strong.crackTime.online).toContain("宇宙年龄");
    expect(estimateStrength("password").crackTime.online).toBe("不到 1 秒");
  });
});

describe("formatCrackTime", () => {
  const YEAR = 31_557_600;

  it("formats human-readable durations", () => {
    expect(formatCrackTime(0.5)).toBe("不到 1 秒");
    expect(formatCrackTime(30)).toBe("30 秒");
    expect(formatCrackTime(90)).toBe("2 分钟");
    expect(formatCrackTime(7200)).toBe("2 小时");
    expect(formatCrackTime(3 * 86400)).toBe("3 天");
    expect(formatCrackTime(100 * YEAR)).toBe("100 年");
    expect(formatCrackTime(2e4 * YEAR)).toBe("2 万年");
    expect(formatCrackTime(3e8 * YEAR)).toBe("3 亿年");
    expect(formatCrackTime(2e10 * YEAR)).toBe("超过宇宙年龄");
    expect(formatCrackTime(Number.NaN)).toBe("不到 1 秒");
  });
});
