import { describe, it, expect } from "vitest";
import { calcBmi, classifyBmi } from "@/lib/bmi";

describe("bmi engine", () => {
  it("classifies boundaries correctly", () => {
    expect(classifyBmi(18.4)).toBe("偏瘦");
    expect(classifyBmi(18.5)).toBe("正常");
    expect(classifyBmi(23.9)).toBe("正常");
    expect(classifyBmi(24)).toBe("超重");
    expect(classifyBmi(27.9)).toBe("超重");
    expect(classifyBmi(28)).toBe("肥胖");
  });

  it("computes values", () => {
    expect(calcBmi({ heightCm: 170, weightKg: 65 }).bmi).toBe(22.5);
    expect(calcBmi({ heightCm: 170, weightKg: 45 }).bmi).toBe(15.6);
    expect(calcBmi({ heightCm: 170, weightKg: 100 }).bmi).toBe(34.6);
  });

  it("rejects invalid inputs instead of NaN (no NaN leak)", () => {
    expect(calcBmi({ heightCm: 0, weightKg: 65 }).valid).toBe(false);
    expect(calcBmi({ heightCm: 170, weightKg: 0 }).valid).toBe(false);
    expect(calcBmi({ heightCm: 170, weightKg: 0 }).category).toBeNull();
    expect(calcBmi({ heightCm: 500, weightKg: 65 }).valid).toBe(false);
  });
});
