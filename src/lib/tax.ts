/**
 * 个税引擎（纯函数）
 *
 * 两种口径：
 *  A) 按月估算（简化）：应纳税所得额 = 税前 - 五险一金(个人) - 起征点5000 - 专项附加扣除
 *  B) 年度汇算：应纳税所得额 = 全年综合所得 - 减除费用60000 - 专项扣除(三险一金) - 专项附加扣除 - 其他扣除
 *     应纳税额按年度综合所得税率表计算；应退/应补 = 应纳税额 - 已预缴税额。
 *
 * 设计要点（修复线上问题）：
 *  1) 城市/比例是"假设"，必须可显式查看与编辑，不能默默用上海 17.5% 套所有人。
 *  2) 支持社保缴费基数上下限（封顶/保底），否则高薪按全额算社保会虚高。
 *  3) 起征点、专项附加扣除、比例来源都作为参数传入并展示，避免"黑箱"。
 *  4) 所有外部数值输入先经 num() 清洗：NaN/Infinity 归零，绝不向 UI 泄漏 NaN；负数在各口径内钳制为 0。
 *  5) 涉及政策的数据（税率表、社保基数、专项附加扣除标准）均带 dataYear / lastVerified 标注，由 UI 显式展示。
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
  /** 基数/比例示例数据所属年份 */
  dataYear: number;
  /** 最近人工核对时间 */
  lastVerified: string;
}

// 常见城市个人缴费比例（示例默认值，实际以参保地当年政策为准）
export const CITY_PRESETS: CityPreset[] = [
  { id: "shanghai", name: "上海", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 7 }, baseFloor: 7384, baseCap: 36549, dataYear: 2026, lastVerified: "2026-08 核对" },
  { id: "beijing", name: "北京", rates: { pension: 8, medical: 2, unemployment: 0.2, housing: 12 }, baseFloor: 6821, baseCap: 33891, dataYear: 2026, lastVerified: "2026-08 核对" },
  { id: "guangzhou", name: "广州", rates: { pension: 8, medical: 2, unemployment: 0.2, housing: 5 }, baseFloor: 5500, baseCap: 27555, dataYear: 2026, lastVerified: "2026-08 核对" },
  { id: "shenzhen", name: "深圳", rates: { pension: 8, medical: 2, unemployment: 0.3, housing: 5 }, baseFloor: 2360, baseCap: 41190, dataYear: 2026, lastVerified: "2026-08 核对" },
];

export const TAX_THRESHOLD = 5000; // 起征点（元/月）
export const ANNUAL_STANDARD_DEDUCTION = 60000; // 减除费用（元/年，年度汇算口径）

// 月度税率表：[上限, 税率, 速算扣除数]（按月预扣的简化估算口径）
const MONTHLY_BRACKETS: Array<[number, number, number]> = [
  [3000, 0.03, 0],
  [12000, 0.10, 210],
  [25000, 0.20, 1410],
  [35000, 0.25, 2660],
  [55000, 0.30, 4410],
  [80000, 0.35, 7160],
  [Infinity, 0.45, 15160],
];

// 年度综合所得税率表：[上限, 税率, 速算扣除数]（年度汇算口径）
export const ANNUAL_BRACKETS: Array<[number, number, number]> = [
  [36000, 0.03, 0],
  [144000, 0.10, 2520],
  [300000, 0.20, 16920],
  [420000, 0.25, 31920],
  [660000, 0.30, 52920],
  [960000, 0.35, 85920],
  [Infinity, 0.45, 181920],
];

/** 税率表数据年份标注（数据年份透明，UI 显式展示） */
export const TAX_TABLE_META = {
  /** 综合所得税率表自 2019-01-01 起施行，至今未调整 */
  effectiveYear: 2019,
  /** 数据口径所属年份（当前有效） */
  dataYear: 2026,
  /** 最近人工核对时间 */
  lastVerified: "2026-08 核对",
} as const;

/** 外部数值清洗：NaN/Infinity 归零（负数由各口径自行钳制） */
const num = (n: number) => (Number.isFinite(n) ? n : 0);

const r2 = (n: number) => Math.round(n * 100) / 100;

export function findBracket(
  taxable: number,
  brackets: Array<[number, number, number]> = MONTHLY_BRACKETS,
): { rate: number; quick: number; label: string } {
  for (const [hi, rate, quick] of brackets) {
    if (taxable <= hi) {
      return { rate, quick, label: `${(rate * 100).toFixed(0)}%` };
    }
  }
  const last = brackets[brackets.length - 1];
  return { rate: last[1], quick: last[2], label: `${(last[1] * 100).toFixed(0)}%` };
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

export function calcTax(input: TaxInput): TaxResult {
  const { rates, applyBaseLimit } = input;
  const salary = num(input.salary);
  const specialAdditional = num(input.specialAdditional);
  const baseFloor = num(input.baseFloor);
  const baseCap = num(input.baseCap);
  const insuranceBase = applyBaseLimit
    ? Math.min(Math.max(salary, baseFloor), baseCap)
    : salary;

  const items = [
    { key: "pension", label: "养老", rate: num(rates.pension) },
    { key: "medical", label: "医疗", rate: num(rates.medical) },
    { key: "unemployment", label: "失业", rate: num(rates.unemployment) },
    { key: "housing", label: "公积金", rate: num(rates.housing) },
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

/* ==================== 专项附加扣除（分类录入） ==================== */

/**
 * 专项附加扣除标准（2023 年国务院提高后的口径，标准自 2023 年起执行，以国务院最新公告为准）
 */
export const SPECIAL_DEDUCTION_STANDARDS = {
  /** 标准最近一次调整年份 */
  dataYear: 2023,
  /** 最近人工核对时间 */
  lastVerified: "2026-08 核对",
  childrenEducationPerChildMonthly: 2000, // 子女教育 元/月/孩
  infantCarePerChildMonthly: 2000, // 3岁以下婴幼儿照护 元/月/孩
  elderlyOnlyMonthly: 3000, // 赡养老人（独生子女）元/月
  elderlySharedMonthlyCap: 1500, // 赡养老人（非独生子女分摊每人上限）元/月
  degreeEducationMonthly: 400, // 学历（学位）继续教育 元/月
  certificateEducationAnnual: 3600, // 职业资格继续教育 元/年（取得证书当年）
  medicalOutOfPocketThreshold: 15000, // 大病医疗：医保目录内自付起扣线 元/年
  medicalAnnualCap: 80000, // 大病医疗：扣除限额 元/年
  housingLoanMonthly: 1000, // 住房贷款利息 元/月（首套，最长240个月）
  housingRentTierMonthly: { tier1: 1500, tier2: 1100, tier3: 800 }, // 住房租金三档 元/月
} as const;

export type ElderlySupportType = "none" | "only" | "shared"; // 赡养老人：不适用/独生子女/非独生子女分摊
export type ContinuingEduType = "none" | "degree" | "certificate"; // 继续教育：不适用/学历/职业资格
export type HousingDeductionType = "none" | "loan" | "rent"; // 住房：不适用/贷款利息/租金（二选一）
export type RentTier = "tier1" | "tier2" | "tier3"; // 租金档次

export interface SpecialDeductionsInput {
  childrenCount: number; // 子女教育：子女数
  infantCount: number; // 3岁以下婴幼儿照护：婴孩数
  elderly: ElderlySupportType;
  continuingEdu: ContinuingEduType;
  medicalSelfPaid: number; // 大病医疗：医保目录内年度自付金额（元）
  housing: HousingDeductionType;
  rentTier: RentTier; // housing === "rent" 时生效
}

export interface SpecialDeductionItem {
  key: string;
  label: string;
  monthly: number; // 按月预扣口径可扣除额（元/月）；仅年度可扣的项目为 0
  annual: number; // 全年扣除额（元）
  annualOnly: boolean; // 是否仅年度汇算可扣
  note: string; // 口径说明
}

export interface SpecialDeductionsResult {
  items: SpecialDeductionItem[];
  totalMonthly: number; // 按月预扣口径合计（不含大病医疗、职业资格继续教育）
  totalAnnual: number; // 全年合计
}

export function calcSpecialDeductions(input: SpecialDeductionsInput): SpecialDeductionsResult {
  const s = SPECIAL_DEDUCTION_STANDARDS;
  const children = Math.max(0, Math.floor(num(input.childrenCount)));
  const infants = Math.max(0, Math.floor(num(input.infantCount)));
  const medicalSelfPaid = Math.max(0, num(input.medicalSelfPaid));

  const childrenEdu = r2(s.childrenEducationPerChildMonthly * children);
  const infantCare = r2(s.infantCarePerChildMonthly * infants);
  const elderlyMonthly =
    input.elderly === "only" ? s.elderlyOnlyMonthly : input.elderly === "shared" ? s.elderlySharedMonthlyCap : 0;
  const degreeMonthly = input.continuingEdu === "degree" ? s.degreeEducationMonthly : 0;
  const certAnnual = input.continuingEdu === "certificate" ? s.certificateEducationAnnual : 0;
  const medicalAnnual = Math.min(Math.max(0, medicalSelfPaid - s.medicalOutOfPocketThreshold), s.medicalAnnualCap);
  const housingMonthly =
    input.housing === "loan"
      ? s.housingLoanMonthly
      : input.housing === "rent"
        ? s.housingRentTierMonthly[input.rentTier]
        : 0;

  const elderlyNote =
    input.elderly === "only"
      ? `独生子女 ${s.elderlyOnlyMonthly} 元/月`
      : input.elderly === "shared"
        ? `非独生子女分摊，每人上限 ${s.elderlySharedMonthlyCap} 元/月`
        : "未选择";
  const eduNote =
    input.continuingEdu === "degree"
      ? `学历（学位）继续教育 ${s.degreeEducationMonthly} 元/月`
      : input.continuingEdu === "certificate"
        ? `职业资格继续教育 ${s.certificateEducationAnnual} 元/年（取得证书当年），仅年度汇算可扣`
        : "未选择";
  const housingNote =
    input.housing === "loan"
      ? `首套住房贷款利息 ${s.housingLoanMonthly} 元/月，与住房租金二选一`
      : input.housing === "rent"
        ? input.rentTier === "tier1"
          ? "直辖市、省会（首府）、计划单列市及国务院确定的其他城市：1500 元/月"
          : input.rentTier === "tier2"
            ? "市辖区户籍人口超过 100 万的城市：1100 元/月"
            : "市辖区户籍人口不超过 100 万的城市：800 元/月"
        : "未选择；贷款利息与租金不可同时扣除";

  const items: SpecialDeductionItem[] = [
    {
      key: "childrenEducation",
      label: "子女教育",
      monthly: childrenEdu,
      annual: r2(childrenEdu * 12),
      annualOnly: false,
      note: `${s.childrenEducationPerChildMonthly} 元/月/孩 × ${children} 孩`,
    },
    {
      key: "infantCare",
      label: "3岁以下婴幼儿照护",
      monthly: infantCare,
      annual: r2(infantCare * 12),
      annualOnly: false,
      note: `${s.infantCarePerChildMonthly} 元/月/孩 × ${infants} 孩`,
    },
    {
      key: "elderly",
      label: "赡养老人",
      monthly: r2(elderlyMonthly),
      annual: r2(elderlyMonthly * 12),
      annualOnly: false,
      note: elderlyNote,
    },
    {
      key: "continuingEdu",
      label: "继续教育",
      monthly: r2(degreeMonthly),
      annual: r2(degreeMonthly * 12 + certAnnual),
      annualOnly: input.continuingEdu === "certificate",
      note: eduNote,
    },
    {
      key: "medical",
      label: "大病医疗",
      monthly: 0,
      annual: r2(medicalAnnual),
      annualOnly: true,
      note: `医保目录内自付超 ${s.medicalOutOfPocketThreshold} 元部分据实扣除，限额 ${s.medicalAnnualCap} 元，仅年度汇算可扣`,
    },
    {
      key: "housing",
      label: input.housing === "rent" ? "住房租金" : "住房贷款利息",
      monthly: r2(housingMonthly),
      annual: r2(housingMonthly * 12),
      annualOnly: false,
      note: housingNote,
    },
  ];

  const totalMonthly = r2(items.reduce((sum, it) => sum + it.monthly, 0));
  const totalAnnual = r2(items.reduce((sum, it) => sum + it.annual, 0));
  return { items, totalMonthly, totalAnnual };
}

/* ==================== 年度汇算 ==================== */

export interface AnnualTaxInput {
  annualIncome: number; // 全年累计综合所得收入（工资薪金等并入汇算的口径）
  prepaidTax: number; // 已预缴税额
  standardDeduction?: number; // 减除费用，默认 60000
  socialInsurance: number; // 专项扣除（三险一金个人部分，全年）
  specialAdditional: number; // 专项附加扣除合计（全年）
  otherDeduction: number; // 其他扣除（年金、商业健康险等，全年）
}

export interface AnnualTaxResult {
  annualIncome: number;
  standardDeduction: number;
  socialInsurance: number;
  specialAdditional: number;
  otherDeduction: number;
  totalDeduction: number;
  taxable: number;
  bracket: { rate: number; quick: number; label: string };
  tax: number; // 年度应纳税额
  prepaid: number;
  settlement: number; // 应退/应补 = 应纳税额 − 已预缴（正=应补，负=应退，0=持平）
  refund: number; // 应退税额（≥0）
  owe: number; // 应补税额（≥0）
}

export function calcAnnualTax(input: AnnualTaxInput): AnnualTaxResult {
  const annualIncome = Math.max(0, num(input.annualIncome));
  const standardDeduction =
    input.standardDeduction === undefined ? ANNUAL_STANDARD_DEDUCTION : Math.max(0, num(input.standardDeduction));
  const socialInsurance = Math.max(0, num(input.socialInsurance));
  const specialAdditional = Math.max(0, num(input.specialAdditional));
  const otherDeduction = Math.max(0, num(input.otherDeduction));
  const prepaid = Math.max(0, num(input.prepaidTax));

  const totalDeduction = r2(standardDeduction + socialInsurance + specialAdditional + otherDeduction);
  const taxable = Math.max(0, r2(annualIncome - totalDeduction));
  const bracket = findBracket(taxable, ANNUAL_BRACKETS);
  const tax = taxable <= 0 ? 0 : r2(taxable * bracket.rate - bracket.quick);
  const settlement = r2(tax - prepaid);

  return {
    annualIncome: r2(annualIncome),
    standardDeduction: r2(standardDeduction),
    socialInsurance: r2(socialInsurance),
    specialAdditional: r2(specialAdditional),
    otherDeduction: r2(otherDeduction),
    totalDeduction,
    taxable,
    bracket,
    tax,
    prepaid: r2(prepaid),
    settlement,
    refund: settlement < 0 ? r2(-settlement) : 0,
    owe: settlement > 0 ? settlement : 0,
  };
}
