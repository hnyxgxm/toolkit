import { describe, it, expect } from "vitest";
import {
  calcTax,
  calcAnnualTax,
  calcSpecialDeductions,
  calcGrossFromTakeHome,
  findBracket,
  findBracketIndex,
  bracketRangeLabel,
  CITY_PRESETS,
  MONTHLY_BRACKETS,
  ANNUAL_BRACKETS,
  ANNUAL_STANDARD_DEDUCTION,
  TAX_TABLE_META,
  SPECIAL_DEDUCTION_STANDARDS,
} from "@/lib/tax";

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

/* ==================== 年度汇算 ==================== */

// 年度表边界：[边界, 边界处税率, 边界处税额, 越界后税率]
const ANNUAL_EDGES: Array<{ edge: number; rate: number; tax: number; nextRate: number }> = [
  { edge: 36000, rate: 0.03, tax: 1080, nextRate: 0.1 },
  { edge: 144000, rate: 0.1, tax: 11880, nextRate: 0.2 },
  { edge: 300000, rate: 0.2, tax: 43080, nextRate: 0.25 },
  { edge: 420000, rate: 0.25, tax: 73080, nextRate: 0.3 },
  { edge: 660000, rate: 0.3, tax: 145080, nextRate: 0.35 },
  { edge: 960000, rate: 0.35, tax: 250080, nextRate: 0.45 },
];

// 年度纯税率口径：收入即应纳税所得额（各项扣除与预缴均为 0）
const annualPure = { standardDeduction: 0, socialInsurance: 0, specialAdditional: 0, otherDeduction: 0, prepaidTax: 0 };

describe("年度税率表分段正确性（边界两侧）", () => {
  for (const { edge, rate, tax, nextRate } of ANNUAL_EDGES) {
    it(`${edge} 元：落在 ${rate} 档，税额 ${tax}`, () => {
      const at = calcAnnualTax({ ...annualPure, annualIncome: edge });
      expect(at.taxable).toBe(edge);
      expect(at.bracket.rate).toBe(rate);
      expect(at.tax).toBe(tax);
    });

    it(`${edge + 0.01} 元：税率跳至 ${nextRate}，税额连续（差 ≤ 0.01）`, () => {
      const above = calcAnnualTax({ ...annualPure, annualIncome: edge + 0.01 });
      const below = calcAnnualTax({ ...annualPure, annualIncome: edge });
      expect(above.bracket.rate).toBe(nextRate);
      expect(Math.abs(above.tax - below.tax)).toBeLessThanOrEqual(0.01);
    });
  }

  it("超过 960000 适用 45% 档", () => {
    const top = calcAnnualTax({ ...annualPure, annualIncome: 960000.01 });
    expect(top.bracket.rate).toBe(0.45);
    expect(top.tax).toBe(250080);
  });

  it("findBracket 支持年度表（速算扣除数 2520/16920/31920/52920/85920/181920）", () => {
    expect(findBracket(36000, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.03, quick: 0 });
    expect(findBracket(144000, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.1, quick: 2520 });
    expect(findBracket(144000.01, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.2, quick: 16920 });
    expect(findBracket(300000.01, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.25, quick: 31920 });
    expect(findBracket(420000.01, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.3, quick: 52920 });
    expect(findBracket(660000.01, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.35, quick: 85920 });
    expect(findBracket(960000.01, ANNUAL_BRACKETS)).toMatchObject({ rate: 0.45, quick: 181920 });
  });
});

describe("年度汇算：应退/应补正负", () => {
  const base = {
    annualIncome: 200000,
    socialInsurance: 30000,
    specialAdditional: 24000,
    otherDeduction: 0,
    standardDeduction: ANNUAL_STANDARD_DEDUCTION,
  };

  it("应纳税所得额 86000 → 税 6080；预缴 3000 → 应补 3080", () => {
    const r = calcAnnualTax({ ...base, prepaidTax: 3000 });
    expect(r.taxable).toBe(86000);
    expect(r.tax).toBe(6080);
    expect(r.settlement).toBe(3080);
    expect(r.owe).toBe(3080);
    expect(r.refund).toBe(0);
  });

  it("预缴 8000 > 应纳税额 → settlement 为负，应退 1920", () => {
    const r = calcAnnualTax({ ...base, prepaidTax: 8000 });
    expect(r.settlement).toBe(-1920);
    expect(r.refund).toBe(1920);
    expect(r.owe).toBe(0);
  });

  it("预缴恰好等于应纳税额 → 应退/应补均为 0", () => {
    const r = calcAnnualTax({ ...base, prepaidTax: 6080 });
    expect(r.settlement).toBe(0);
    expect(r.refund).toBe(0);
    expect(r.owe).toBe(0);
  });

  it("收入不超减除费用 → 税 0；预缴 100 → 应退 100", () => {
    const r = calcAnnualTax({ annualIncome: 50000, prepaidTax: 100, socialInsurance: 0, specialAdditional: 0, otherDeduction: 0 });
    expect(r.taxable).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.settlement).toBe(-100);
    expect(r.refund).toBe(100);
  });

  it("减除费用默认 60000，可显式覆盖", () => {
    expect(calcAnnualTax({ ...base, prepaidTax: 0 }).standardDeduction).toBe(60000);
    const custom = calcAnnualTax({ ...base, prepaidTax: 0, standardDeduction: 0 });
    expect(custom.standardDeduction).toBe(0);
    expect(custom.taxable).toBe(146000);
  });
});

describe("专项附加扣除分类录入（2023 年国发标准）", () => {
  const none: Parameters<typeof calcSpecialDeductions>[0] = {
    childrenCount: 0,
    infantCount: 0,
    elderly: "none",
    continuingEdu: "none",
    medicalSelfPaid: 0,
    housing: "none",
    rentTier: "tier1",
  };
  const item = (r: ReturnType<typeof calcSpecialDeductions>, key: string) => r.items.find((x) => x.key === key)!;

  it("各分类之和 = totalAnnual；按月可扣项之和 = totalMonthly", () => {
    const r = calcSpecialDeductions({ ...none, childrenCount: 1, infantCount: 1, elderly: "shared", continuingEdu: "degree", medicalSelfPaid: 40000, housing: "rent", rentTier: "tier2" });
    expect(r.items.reduce((s, it) => s + it.annual, 0)).toBeCloseTo(r.totalAnnual, 2);
    expect(r.items.reduce((s, it) => s + it.monthly, 0)).toBeCloseTo(r.totalMonthly, 2);
    expect(r.totalAnnual).toBe(109000); // 24000 + 24000 + 18000 + 4800 + 25000 + 13200
    expect(r.totalMonthly).toBe(7000); // 2000 + 2000 + 1500 + 400 + 0 + 1100
  });

  it("子女教育 / 婴幼儿照护：2000 元/月/孩", () => {
    const r = calcSpecialDeductions({ ...none, childrenCount: 2, infantCount: 1 });
    expect(item(r, "childrenEducation").monthly).toBe(4000);
    expect(item(r, "childrenEducation").annual).toBe(48000);
    expect(item(r, "infantCare").monthly).toBe(2000);
    expect(item(r, "infantCare").annual).toBe(24000);
  });

  it("赡养老人：独生 3000/月，非独生分摊上限 1500/月", () => {
    const only = calcSpecialDeductions({ ...none, elderly: "only" });
    expect(item(only, "elderly").monthly).toBe(3000);
    expect(item(only, "elderly").annual).toBe(36000);
    const shared = calcSpecialDeductions({ ...none, elderly: "shared" });
    expect(item(shared, "elderly").monthly).toBe(1500);
    expect(item(shared, "elderly").annual).toBe(18000);
  });

  it("继续教育：学历 400/月；职业资格 3600/年 且仅年度汇算可扣", () => {
    const degree = calcSpecialDeductions({ ...none, continuingEdu: "degree" });
    expect(item(degree, "continuingEdu").monthly).toBe(400);
    expect(item(degree, "continuingEdu").annual).toBe(4800);
    const cert = calcSpecialDeductions({ ...none, continuingEdu: "certificate" });
    expect(item(cert, "continuingEdu").monthly).toBe(0);
    expect(item(cert, "continuingEdu").annual).toBe(3600);
    expect(item(cert, "continuingEdu").annualOnly).toBe(true);
  });

  it("大病医疗：自付超 15000 部分扣除、限额 80000、仅年度汇算", () => {
    const partial = calcSpecialDeductions({ ...none, medicalSelfPaid: 40000 });
    expect(item(partial, "medical").annual).toBe(25000);
    const capped = calcSpecialDeductions({ ...none, medicalSelfPaid: 200000 });
    expect(item(capped, "medical").annual).toBe(80000);
    const below = calcSpecialDeductions({ ...none, medicalSelfPaid: 10000 });
    expect(item(below, "medical").annual).toBe(0);
    expect(item(partial, "medical").monthly).toBe(0);
    expect(item(partial, "medical").annualOnly).toBe(true);
  });

  it("住房：房贷利息 1000/月；租金三档 1500/1100/800", () => {
    const loan = calcSpecialDeductions({ ...none, housing: "loan", rentTier: "tier1" });
    expect(item(loan, "housing").monthly).toBe(1000);
    expect(item(loan, "housing").annual).toBe(12000);
    const t1 = calcSpecialDeductions({ ...none, housing: "rent", rentTier: "tier1" });
    const t2 = calcSpecialDeductions({ ...none, housing: "rent", rentTier: "tier2" });
    const t3 = calcSpecialDeductions({ ...none, housing: "rent", rentTier: "tier3" });
    expect(item(t1, "housing").monthly).toBe(1500);
    expect(item(t2, "housing").monthly).toBe(1100);
    expect(item(t3, "housing").monthly).toBe(800);
  });
});

describe("非法输入（NaN/负数）不产生 NaN", () => {
  it("年度：NaN/负数输入 → 结果全部有限，负数按 0 计", () => {
    const r = calcAnnualTax({
      annualIncome: NaN,
      prepaidTax: NaN,
      socialInsurance: -5000,
      specialAdditional: -1000,
      otherDeduction: NaN,
    });
    for (const v of [r.annualIncome, r.totalDeduction, r.taxable, r.tax, r.prepaid, r.settlement, r.refund, r.owe]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(r.taxable).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.settlement).toBe(0);
  });

  it("按月：NaN 薪资/扣除 → 结果全部有限", () => {
    const r = calcTax({ rates: sh.rates, specialAdditional: NaN, applyBaseLimit: false, baseFloor: sh.baseFloor, baseCap: sh.baseCap, salary: NaN });
    for (const v of [r.insuranceTotal, r.taxable, r.tax, r.takeHome, r.yearTakeHome]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(r.taxable).toBe(0);
    expect(r.tax).toBe(0);
  });

  it("分类扣除：NaN/负数孩数与自付额 → 合计有限且仅按有效项计算", () => {
    const r = calcSpecialDeductions({ childrenCount: NaN, infantCount: -3, elderly: "shared", continuingEdu: "certificate", medicalSelfPaid: NaN, housing: "rent", rentTier: "tier3" });
    expect(Number.isFinite(r.totalMonthly)).toBe(true);
    expect(Number.isFinite(r.totalAnnual)).toBe(true);
    expect(r.totalAnnual).toBe(18000 + 3600 + 9600); // 赡养(非独生) + 职业资格 + 租金800×12
    expect(r.totalMonthly).toBe(1500 + 800);
  });
});

describe("数据年份透明（dataYear / lastVerified）", () => {
  it("城市预设均带 dataYear / lastVerified 标注，覆盖 40+ 城市", () => {
    expect(CITY_PRESETS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CITY_PRESETS.map((c) => c.id)).size).toBe(CITY_PRESETS.length);
    for (const c of CITY_PRESETS) {
      expect(c.dataYear).toBeGreaterThanOrEqual(2025); // 仅保留近两个社保年度的数据，杜绝旧数据冒充新年度
      expect(c.lastVerified.length).toBeGreaterThan(0);
      expect(c.baseFloor).toBeGreaterThan(0);
      expect(c.baseFloor).toBeLessThan(c.baseCap);
      expect(c.rates.pension).toBe(8);
      expect(c.rates.medical).toBe(2);
      expect(c.rates.unemployment).toBeGreaterThanOrEqual(0.2);
      expect(c.rates.unemployment).toBeLessThanOrEqual(0.5);
      expect(c.rates.housing).toBeGreaterThanOrEqual(5);
      expect(c.rates.housing).toBeLessThanOrEqual(12);
    }
  });

  it("税率表标注核对时间；年度表 7 档边界与速算扣除数正确", () => {
    expect(TAX_TABLE_META.lastVerified).toContain("2026-08");
    expect(TAX_TABLE_META.dataYear).toBe(2026);
    expect(ANNUAL_BRACKETS.map((b) => b[0])).toEqual([36000, 144000, 300000, 420000, 660000, 960000, Infinity]);
    expect(ANNUAL_BRACKETS.map((b) => b[2])).toEqual([0, 2520, 16920, 31920, 52920, 85920, 181920]);
  });

  it("专项附加扣除标准为 2023 年国发提高后口径，且已标注核对时间", () => {
    expect(SPECIAL_DEDUCTION_STANDARDS.dataYear).toBe(2023);
    expect(SPECIAL_DEDUCTION_STANDARDS.lastVerified).toContain("2026-08");
    expect(SPECIAL_DEDUCTION_STANDARDS.childrenEducationPerChildMonthly).toBe(2000);
    expect(SPECIAL_DEDUCTION_STANDARDS.infantCarePerChildMonthly).toBe(2000);
    expect(SPECIAL_DEDUCTION_STANDARDS.elderlyOnlyMonthly).toBe(3000);
    expect(SPECIAL_DEDUCTION_STANDARDS.elderlySharedMonthlyCap).toBe(1500);
  });
});

/* ==================== 税率表定位与区间文案（结果页高亮当前档） ==================== */

describe("findBracketIndex / bracketRangeLabel", () => {
  it("月度表定位：与 findBracket 档位一致（边界值归低档）", () => {
    expect(findBracketIndex(0)).toBe(0);
    expect(findBracketIndex(3000)).toBe(0);
    expect(findBracketIndex(3000.01)).toBe(1);
    expect(findBracketIndex(12000)).toBe(1);
    expect(findBracketIndex(12000.01)).toBe(2);
    expect(findBracketIndex(80000)).toBe(5);
    expect(findBracketIndex(80000.01)).toBe(6);
    expect(findBracketIndex(NaN)).toBe(0); // 非法输入归零后落第一档
  });

  it("年度表定位：七档边界与 findBracket 结果一致", () => {
    expect(findBracketIndex(36000, ANNUAL_BRACKETS)).toBe(0);
    expect(findBracketIndex(36000.01, ANNUAL_BRACKETS)).toBe(1);
    expect(findBracketIndex(960000, ANNUAL_BRACKETS)).toBe(5);
    expect(findBracketIndex(960000.01, ANNUAL_BRACKETS)).toBe(6);
    expect(findBracketIndex(99999999, ANNUAL_BRACKETS)).toBe(6);
  });

  it("月度表共 7 档、年度表共 7 档（供结果页固定展示七级表）", () => {
    expect(MONTHLY_BRACKETS).toHaveLength(7);
    expect(MONTHLY_BRACKETS.map((b) => b[0])).toEqual([3000, 12000, 25000, 35000, 55000, 80000, Infinity]);
    expect(MONTHLY_BRACKETS.map((b) => b[2])).toEqual([0, 210, 1410, 2660, 4410, 7160, 15160]);
    expect(ANNUAL_BRACKETS).toHaveLength(7);
  });

  it("区间文案：首档/中间档/末档（官方表述风格）", () => {
    expect(bracketRangeLabel(MONTHLY_BRACKETS, 0)).toBe("不超过 3,000 元");
    expect(bracketRangeLabel(MONTHLY_BRACKETS, 1)).toBe("超过 3,000 元至 12,000 元");
    expect(bracketRangeLabel(MONTHLY_BRACKETS, 6)).toBe("超过 80,000 元");
    expect(bracketRangeLabel(ANNUAL_BRACKETS, 0)).toBe("不超过 36,000 元");
    expect(bracketRangeLabel(ANNUAL_BRACKETS, 6)).toBe("超过 960,000 元");
  });

  it("findBracket 行为不回归：边界值与速算扣除数", () => {
    expect(findBracket(3000)).toMatchObject({ rate: 0.03, quick: 0 });
    expect(findBracket(3000.01)).toMatchObject({ rate: 0.1, quick: 210 });
    expect(findBracket(120000)).toMatchObject({ rate: 0.45, quick: 15160 });
  });
});

/* ==================== 税后反推税前（二分，不变式） ==================== */

describe("calcGrossFromTakeHome：税后反推税前", () => {
  const params = { rates: sh.rates, specialAdditional: 0, applyBaseLimit: false, baseFloor: sh.baseFloor, baseCap: sh.baseCap };

  it("不变式·反推误差 < 0.01 元：任意目标税后反推后正算税后与目标差 < 0.01", () => {
    for (const t of [3000, 4125, 10000, 18910, 30000, 50000, 88888.88, 120000]) {
      const rev = calcGrossFromTakeHome(t, params);
      expect(rev.converged).toBe(true);
      expect(rev.residual).toBeLessThan(0.01);
      expect(rev.takeHome).toBeCloseTo(t, 2);
    }
  });

  it("不变式·往返一致：正算税后 → 反推税前 ≈ 原税前（分级精度）", () => {
    for (const s of [5000, 8000, 12345.67, 25000, 68000, 120000]) {
      const fwd = calcTax({ ...params, salary: s });
      const rev = calcGrossFromTakeHome(fwd.takeHome, params);
      expect(rev.converged).toBe(true);
      // 反推的税前正算回去，税后必须与目标一致（< 0.01 元）；税前本身允许 1 分钱舍入
      expect(Math.abs(rev.takeHome - fwd.takeHome)).toBeLessThan(0.01);
      expect(Math.abs(rev.gross - s)).toBeLessThan(0.02);
    }
  });

  it("开启社保基数封顶/保底后往返一致", () => {
    const capped = { ...params, applyBaseLimit: true };
    for (const s of [3000, 6000, 20000, 50000, 100000, 200000]) {
      const fwd = calcTax({ ...capped, salary: s });
      const rev = calcGrossFromTakeHome(fwd.takeHome, capped);
      expect(rev.converged).toBe(true);
      expect(Math.abs(rev.takeHome - fwd.takeHome)).toBeLessThan(0.01);
      expect(Math.abs(rev.gross - s)).toBeLessThan(0.02);
    }
  });

  it("含专项附加扣除后往返一致", () => {
    const withDeduction = { ...params, specialAdditional: 3000 };
    for (const s of [8000, 15000, 30000]) {
      const fwd = calcTax({ ...withDeduction, salary: s });
      const rev = calcGrossFromTakeHome(fwd.takeHome, withDeduction);
      expect(Math.abs(rev.gross - s)).toBeLessThan(0.02);
    }
  });

  it("反推结果满足完整恒等式：gross − 五险一金 − 个税 = takeHome ≈ target", () => {
    const rev = calcGrossFromTakeHome(18910, params);
    const recheck = calcTax({ ...params, salary: rev.gross });
    expect(recheck.takeHome).toBe(rev.takeHome);
    expect(rev.insuranceTotal).toBe(recheck.insuranceTotal);
    expect(rev.tax).toBe(recheck.tax);
    expect(Math.abs(rev.takeHome - 18910)).toBeLessThan(0.01);
  });

  it("NaN/负数目标：钳制为 0 且结果全部有限", () => {
    for (const t of [NaN, -5000, Infinity]) {
      const rev = calcGrossFromTakeHome(t, params);
      expect(rev.target).toBe(0);
      for (const v of [rev.gross, rev.insuranceTotal, rev.taxable, rev.tax, rev.takeHome, rev.residual]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(rev.gross).toBeGreaterThanOrEqual(0);
    }
  });

  it("各城市预设下反推均收敛且残差 < 0.01", () => {
    for (const c of CITY_PRESETS) {
      const p = { rates: c.rates, specialAdditional: 0, applyBaseLimit: true, baseFloor: c.baseFloor, baseCap: c.baseCap };
      const rev = calcGrossFromTakeHome(20000, p);
      expect(rev.converged).toBe(true);
      expect(rev.residual).toBeLessThan(0.01);
    }
  });
});
