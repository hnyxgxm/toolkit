/**
 * 个税引擎（纯函数）
 *
 * 中国大陆工资薪金个税，按"月度"累计口径的简化版：
 *   应纳税所得额 = 税前 - 五险一金(个人) - 起征点5000 - 专项附加扣除
 *   个税 = 应纳税所得额 × 税率 - 速算扣除数
 *   到手 = 税前 - 五险一金(个人) - 个税
 *
 * 设计要点（修复线上问题）：
 *  1) 城市/比例是"假设"，必须可显式查看与编辑，不能默默用上海 17.5% 套所有人。
 *  2) 支持社保缴费基数上下限（封顶/保底），否则高薪按全额算社保会虚高。
 *  3) 起征点、专项附加扣除、比例来源都作为参数传入并展示，避免"黑箱"。
 */

export interface Rates {
  pension: number; // 养老 %
  medical: number; // 医疗 %
  unemployment: number; // 失业 %
  housing: number; // 公积金 %
}

export interface CityPreset {
  id: string;
  name: string;
  rates: Rates;
  baseFloor: number; // 缴费基数下限（元/月）
  baseCap: number; // 缴费基数上限（元/月）
}

// 常见城市个人缴费比例（示例默认值，实际以参保地当年政策为准）
export const CITY_PRESETS: CityPreset[] = [
  { id: "shanghai", name: "上海", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 7 }, baseFloor: 7384, baseCap: 36549 },
  { id: "beijing", name: "北京", rates: { pension: 8, medical: 2, unemployment: 0.2, housing: 12 }, baseFloor: 6821, baseCap: 33891 },
  { id: "guangzhou", name: "广州", rates: { pension: 8, medical: 2, unemployment: 0.2, housing: 5 }, baseFloor: 5500, baseCap: 27555 },
  { id: "shenzhen", name: "深圳", rates: { pension: 8, medical: 2, unemployment: 0.3, housing: 5 }, baseFloor: 2360, baseCap: 41190 },
];

export const TAX_THRESHOLD = 5000; // 起征点

// 月度税率表：[上限, 税率, 速算扣除数]
const MONTHLY_BRACKETS: Array<[number, number, number]> = [
  [3000, 0.03, 0],
  [12000, 0.10, 210],
  [25000, 0.20, 1410],
  [35000, 0.25, 2660],
  [55000, 0.30, 4410],
  [80000, 0.35, 7160],
  [Infinity, 0.45, 15160],
];

export function findBracket(taxable: number): { rate: number; quick: number; label: string } {
  for (const [hi, rate, quick] of MONTHLY_BRACKETS) {
    if (taxable <= hi) {
      return { rate, quick, label: `${(rate * 100).toFixed(0)}%` };
    }
  }
  return { rate: 0.45, quick: 15160, label: "45%" };
}

export interface TaxInput {
  salary: number; // 税前月薪
  rates: Rates;
  specialAdditional: number; // 专项附加扣除（月）
  applyBaseLimit: boolean; // 是否按社保基数上下限
  baseFloor: number;
  baseCap: number;
}

export interface TaxResult {
  insuranceBase: number;
  breakdown: Array<{ key: string; label: string; rate: number; amount: number }>;
  insuranceTotal: number;
  taxable: number;
  bracket: { rate: number; quick: number; label: string };
  tax: number;
  takeHome: number;
  yearTakeHome: number;
  housingFundPersonal: number; // 公积金个人账户入账（个人+单位等效，这里给个人）
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcTax(input: TaxInput): TaxResult {
  const { salary, rates, specialAdditional, applyBaseLimit, baseFloor, baseCap } = input;
  const insuranceBase = applyBaseLimit
    ? Math.min(Math.max(salary, baseFloor), baseCap)
    : salary;

  const items = [
    { key: "pension", label: "养老", rate: rates.pension },
    { key: "medical", label: "医疗", rate: rates.medical },
    { key: "unemployment", label: "失业", rate: rates.unemployment },
    { key: "housing", label: "公积金", rate: rates.housing },
  ];
  const breakdown = items.map((it) => ({
    ...it,
    amount: r2((insuranceBase * it.rate) / 100),
  }));
  const insuranceTotal = r2(breakdown.reduce((s, b) => s + b.amount, 0));

  const taxable = Math.max(0, r2(salary - insuranceTotal - TAX_THRESHOLD - specialAdditional));
  const bracket = findBracket(taxable);
  const tax = taxable <= 0 ? 0 : r2(taxable * bracket.rate - bracket.quick);
  const takeHome = r2(salary - insuranceTotal - tax);
  const housingFundPersonal = r2((insuranceBase * rates.housing) / 100);

  return {
    insuranceBase: r2(insuranceBase),
    breakdown,
    insuranceTotal,
    taxable,
    bracket,
    tax,
    takeHome,
    yearTakeHome: r2(takeHome * 12),
    housingFundPersonal,
  };
}
