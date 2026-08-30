import { describe, it, expect } from "vitest";
import {
  calcBmi,
  classifyBmi,
  classifyBmiBy,
  healthyWeightRange,
  assessWaist,
  BMI_STANDARDS,
  WAIST_CUTOFF_CM,
} from "@/lib/bmi";

const round1 = (n: number): number => Math.round(n * 10) / 10;

describe("bmi engine · 分类边界", () => {
  it("中国标准 WS/T 428-2013：18.5 / 24 / 28", () => {
    expect(classifyBmi(18.4)).toBe("偏瘦");
    expect(classifyBmi(18.5)).toBe("正常");
    expect(classifyBmi(23.9)).toBe("正常");
    expect(classifyBmi(24)).toBe("超重");
    expect(classifyBmi(27.9)).toBe("超重");
    expect(classifyBmi(28)).toBe("肥胖");
  });

  it("WHO 标准：18.5 / 25 / 30", () => {
    expect(classifyBmiBy(24.9, "who")).toBe("正常");
    expect(classifyBmiBy(25, "who")).toBe("超重");
    expect(classifyBmiBy(29.9, "who")).toBe("超重");
    expect(classifyBmiBy(30, "who")).toBe("肥胖");
    expect(classifyBmiBy(18.4, "who")).toBe("偏瘦");
  });

  it("两标准在 24–25 与 28–30 区间判定不同（口径差异确实生效）", () => {
    expect(classifyBmiBy(24.5, "china")).toBe("超重");
    expect(classifyBmiBy(24.5, "who")).toBe("正常");
    expect(classifyBmiBy(29, "china")).toBe("肥胖");
    expect(classifyBmiBy(29, "who")).toBe("超重");
  });
});

describe("bmi engine · 数值计算", () => {
  it("computes values", () => {
    expect(calcBmi({ heightCm: 170, weightKg: 65 }).bmi).toBe(22.5);
    expect(calcBmi({ heightCm: 170, weightKg: 45 }).bmi).toBe(15.6);
    expect(calcBmi({ heightCm: 170, weightKg: 100 }).bmi).toBe(34.6);
  });

  it("默认口径为中国标准，切标准后同一人体判定随切点变化", () => {
    // 170cm / 70kg → BMI 24.2
    const china = calcBmi({ heightCm: 170, weightKg: 70 });
    expect(china.standard).toBe("china");
    expect(china.category).toBe("超重");

    const who = calcBmi({ heightCm: 170, weightKg: 70, standard: "who" });
    expect(who.bmi).toBe(24.2);
    expect(who.category).toBe("正常");
  });

  it("阈值表随标准切换并保留四档结构", () => {
    const china = calcBmi({ heightCm: 170, weightKg: 65 });
    expect(china.boundaries.map((b) => b.category)).toEqual(["偏瘦", "正常", "超重", "肥胖"]);
    expect(china.boundaries[3].min).toBe(28);
    const who = calcBmi({ heightCm: 170, weightKg: 65, standard: "who" });
    expect(who.boundaries[1].max).toBe(25);
    expect(who.boundaries[3].min).toBe(30);
  });
});

describe("bmi engine · 健康体重区间与增减反算（往返一致）", () => {
  it("区间 = 标准正常 BMI × 身高²，170cm/中国标准 = 53.5–69.1 kg", () => {
    expect(healthyWeightRange(170, "china")).toEqual([53.5, 69.1]);
    expect(calcBmi({ heightCm: 170, weightKg: 65 }).healthyWeightRange).toEqual([53.5, 69.1]);
  });

  it("WHO 口径区间上限随切点放宽：170cm = 53.5–72 kg", () => {
    expect(healthyWeightRange(170, "who")).toEqual([53.5, 72]);
  });

  it("需减重：80kg 高于区间上限，delta = 上限 − 当前；补回后回到边界", () => {
    const r = calcBmi({ heightCm: 170, weightKg: 80 });
    expect(r.weightDeltaKg).toBeCloseTo(r.healthyWeightRange[1] - 80, 5); // 69.1 − 80 = −10.9
    const after = calcBmi({ heightCm: 170, weightKg: 80 + r.weightDeltaKg });
    expect(after.bmi).toBeLessThanOrEqual(BMI_STANDARDS.china.overweightMin);
    expect(after.category).toBe("正常");
  });

  it("需增重：45kg 低于区间下限，delta = 下限 − 当前；补回后回到边界", () => {
    const r = calcBmi({ heightCm: 170, weightKg: 45 });
    expect(r.weightDeltaKg).toBeCloseTo(r.healthyWeightRange[0] - 45, 5); // 53.5 − 45 = +8.5
    const after = calcBmi({ heightCm: 170, weightKg: 45 + r.weightDeltaKg });
    expect(after.bmi).toBeGreaterThanOrEqual(BMI_STANDARDS.china.normalMin);
    expect(after.category).toBe("正常");
  });

  it("区间内 delta = 0", () => {
    expect(calcBmi({ heightCm: 170, weightKg: 65 }).weightDeltaKg).toBe(0);
  });

  it("多身高 × 双标准往返性质：w+delta 后的 BMI 恰落在对应切点上", () => {
    const heights = [150, 160, 170, 175, 180, 190, 200];
    for (const h of heights) {
      for (const std of ["china", "who"] as const) {
        const s = BMI_STANDARDS[std];
        // 超重侧（BMI=30 明显高于两标准上限）
        const wOver = round1(30 * (h / 100) ** 2);
        const over = calcBmi({ heightCm: h, weightKg: wOver, standard: std });
        expect(over.weightDeltaKg).toBeLessThan(0);
        const wAfter = wOver + over.weightDeltaKg;
        expect(Math.abs(wAfter / (h / 100) ** 2 - over.healthyWeightRange[1] / (h / 100) ** 2)).toBeLessThan(0.05);
        // 偏瘦侧（BMI=15 低于两标准下限）
        const wUnder = round1(15 * (h / 100) ** 2);
        const under = calcBmi({ heightCm: h, weightKg: wUnder, standard: std });
        expect(under.weightDeltaKg).toBeGreaterThan(0);
        const wAfter2 = wUnder + under.weightDeltaKg;
        expect(Math.abs(wAfter2 / (h / 100) ** 2 - under.healthyWeightRange[0] / (h / 100) ** 2)).toBeLessThan(0.05);
        // 区间本身可复算：min = 18.5×m²（0.1kg 精度）
        const m2 = (h / 100) ** 2;
        expect(over.healthyWeightRange[0]).toBeCloseTo(round1(18.5 * m2), 5);
        expect(s.overweightMin).toBeGreaterThan(s.normalMin);
      }
    }
  });
});

describe("bmi engine · 腰围（中心型肥胖，WS/T 428-2013）", () => {
  it("切点：男 ≥90 / 女 ≥85 cm", () => {
    expect(WAIST_CUTOFF_CM).toEqual({ male: 90, female: 85 });
    expect(assessWaist(90, "male")).toBe("central");
    expect(assessWaist(89.9, "male")).toBe("normal");
    expect(assessWaist(85, "female")).toBe("central");
    expect(assessWaist(84.9, "female")).toBe("normal");
  });

  it("缺性别 → need-sex；缺腰围 → null", () => {
    expect(assessWaist(92)).toBe("need-sex");
    expect(assessWaist(undefined, "male")).toBeNull();
    expect(assessWaist()).toBeNull();
  });

  it("结果携带腰围风险与对应切点", () => {
    const r = calcBmi({ heightCm: 170, weightKg: 65, sex: "male", waistCm: 95 });
    expect(r.waist?.status).toBe("central");
    expect(r.waist?.cutoff).toBe(90);
    const ok = calcBmi({ heightCm: 170, weightKg: 65, sex: "female", waistCm: 70 });
    expect(ok.waist?.status).toBe("normal");
    const noSex = calcBmi({ heightCm: 170, weightKg: 65, waistCm: 95 });
    expect(noSex.waist?.status).toBe("need-sex");
    const none = calcBmi({ heightCm: 170, weightKg: 65 });
    expect(none.waist).toBeNull();
  });
});

describe("bmi engine · 年龄提示", () => {
  it("未满 18 岁标记 minor", () => {
    expect(calcBmi({ heightCm: 170, weightKg: 60, ageYears: 15 }).ageNote).toBe("minor");
  });
  it("65 岁及以上标记 senior", () => {
    expect(calcBmi({ heightCm: 170, weightKg: 60, ageYears: 68 }).ageNote).toBe("senior");
  });
  it("成年人无提示；未填年龄无提示", () => {
    expect(calcBmi({ heightCm: 170, weightKg: 60, ageYears: 30 }).ageNote).toBeNull();
    expect(calcBmi({ heightCm: 170, weightKg: 60 }).ageNote).toBeNull();
  });
});

describe("bmi engine · 非法输入拦截（不泄漏 NaN）", () => {
  it("rejects invalid inputs instead of NaN (no NaN leak)", () => {
    expect(calcBmi({ heightCm: 0, weightKg: 65 }).valid).toBe(false);
    expect(calcBmi({ heightCm: 170, weightKg: 0 }).valid).toBe(false);
    expect(calcBmi({ heightCm: 170, weightKg: 0 }).category).toBeNull();
    expect(calcBmi({ heightCm: 500, weightKg: 65 }).valid).toBe(false);
    expect(calcBmi({ heightCm: NaN, weightKg: 65 }).valid).toBe(false);
  });

  it("年龄/腰围越界同样拦截并给出可读错误", () => {
    const badAge = calcBmi({ heightCm: 170, weightKg: 60, ageYears: 300 });
    expect(badAge.valid).toBe(false);
    expect(badAge.error).toContain("年龄");
    const badWaist = calcBmi({ heightCm: 170, weightKg: 60, waistCm: 500 });
    expect(badWaist.valid).toBe(false);
    expect(badWaist.error).toContain("腰围");
  });
});
