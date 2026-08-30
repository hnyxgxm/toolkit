import { describe, it, expect } from "vitest";
import { calcTax, CITY_PRESETS } from "@/lib/tax";

const sh = CITY_PRESETS.find((c) => c.id === "shanghai")!;

describe("tax engine (shanghai 17.5%, no base cap)", () => {
  const base = { rates: sh.rates, specialAdditional: 0, applyBaseLimit: false, baseFloor: sh.baseFloor, baseCap: sh.baseCap };

  it("5000 → 五险一金875 / 税0 / 到手4125", () => {
    const r = calcTax({ ...base, salary: 5000 });
    expect(r.insuranceTotal).toBe(875);
    expect(r.tax).toBe(0);
    expect(r.takeHome).toBe(4125);
  });

  it("10000 → 1750 / 115 / 8135", () => {
    const r = calcTax({ ...base, salary: 10000 });
    expect(r.taxable).toBe(3250);
    expect(r.tax).toBe(115);
    expect(r.takeHome).toBe(8135);
  });

  it("25000 → 4375 / 1715 / 18910", () => {
    const r = calcTax({ ...base, salary: 25000 });
    expect(r.taxable).toBe(15625);
    expect(r.tax).toBe(1715);
    expect(r.takeHome).toBe(18910);
  });

  it("self-consistency: salary - insurance - tax = takeHome", () => {
    for (const s of [3000, 8000, 30000, 88000, 120000]) {
      const r = calcTax({ ...base, salary: s });
      expect(Math.round((s - r.insuranceTotal - r.tax) * 100) / 100).toBe(r.takeHome);
    }
  });

  it("base cap limits insurance for very high salary when enabled", () => {
    const withCap = calcTax({ rates: sh.rates, specialAdditional: 0, applyBaseLimit: true, baseFloor: sh.baseFloor, baseCap: sh.baseCap, salary: 100000 });
    expect(withCap.insuranceBase).toBe(sh.baseCap); // 封顶
    expect(withCap.insuranceTotal).toBeCloseTo((sh.baseCap * 17.5) / 100, 0);
  });

  it("special additional deduction lowers taxable", () => {
    const a = calcTax({ ...base, salary: 25000 });
    const b = calcTax({ ...base, salary: 25000, specialAdditional: 2000 });
    expect(b.taxable).toBe(a.taxable - 2000);
    expect(b.takeHome).toBeGreaterThan(a.takeHome);
  });
});
