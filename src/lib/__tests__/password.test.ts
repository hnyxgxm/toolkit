import { describe, it, expect } from "vitest";
import { generatePassword, evaluateStrength, poolFor } from "@/lib/password";

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

  it("strength grows with length/pool", () => {
    const weak = evaluateStrength(6, 26);
    const strong = evaluateStrength(20, 80);
    expect(strong.bits).toBeGreaterThan(weak.bits);
    expect(strong.level).toBe("非常强");
    expect(weak.level).toMatch(/极弱|弱/);
  });

  it("excludeAmbiguous removes confusable chars from pool", () => {
    const amb = poolFor({ upper: true, lower: true, digit: true, symbol: false }, false);
    const noAmb = poolFor({ upper: true, lower: true, digit: true, symbol: false }, true);
    expect(amb).toContain("0");
    expect(noAmb).not.toMatch(/[0O1lI]/);
    expect(noAmb.length).toBeLessThan(amb.length);
  });
});
