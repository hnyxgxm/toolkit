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

import { money } from "@/lib/format";

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
// 基数来源：各地人社/税务部门 2025/2026 社保年度公告；2026 社保年度（2026.7 起）陆续公布，
// 未公布省份沿用最近年度并如实标注 dataYear / lastVerified。失业个人比例未查到的按 0.5% 默认，
// 公积金未查到的按多数企业经营中常见的 5% 档默认（UI 可编辑）。
export const CITY_PRESETS: CityPreset[] = [
  // ---- 直辖市 ----
  { id: "beijing", name: "北京", rates: { pension: 8, medical: 2, unemployment: 0.2, housing: 12 }, baseFloor: 7270, baseCap: 36348, dataYear: 2026, lastVerified: "2026-08 公告" },
  { id: "shanghai", name: "上海", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 7 }, baseFloor: 7546, baseCap: 37731, dataYear: 2026, lastVerified: "2026-08 公告" },
  { id: "tianjin", name: "天津", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 5124, baseCap: 25620, dataYear: 2025, lastVerified: "2025-10 公告" },
  { id: "chongqing", name: "重庆", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4404, baseCap: 22017, dataYear: 2025, lastVerified: "2025-09 公告" },
  // ---- 省会 ----
  { id: "shijiazhuang", name: "石家庄", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4076, baseCap: 20382, dataYear: 2026, lastVerified: "2026-07 公告" },
  { id: "taiyuan", name: "太原", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4198, baseCap: 20991, dataYear: 2025, lastVerified: "2025-01 执行" },
  { id: "huhehaote", name: "呼和浩特", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 5058, baseCap: 25290, dataYear: 2026, lastVerified: "2026-07 公告" },
  { id: "shenyang", name: "沈阳", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4359, baseCap: 21792, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "changchun", name: "长春", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4393.2, baseCap: 21966, dataYear: 2025, lastVerified: "2025-07 公告" },
  { id: "haerbin", name: "哈尔滨", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4623, baseCap: 23115, dataYear: 2026, lastVerified: "2026-07 公告" },
  { id: "nanjing", name: "南京", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4952, baseCap: 24762, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "hangzhou", name: "杭州", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4986, baseCap: 25299, dataYear: 2025, lastVerified: "2025-01 执行" },
  { id: "hefei", name: "合肥", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4311, baseCap: 21556, dataYear: 2025, lastVerified: "2025-01 执行" },
  { id: "fuzhou", name: "福州", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4433, baseCap: 22164, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "nanchang", name: "南昌", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 3915, baseCap: 19575, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "jinan", name: "济南", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4573, baseCap: 22863, dataYear: 2026, lastVerified: "2026-07 公告" },
  { id: "zhengzhou", name: "郑州", rates: { pension: 8, medical: 2, unemployment: 0.3, housing: 5 }, baseFloor: 3831, baseCap: 19155, dataYear: 2025, lastVerified: "2025-07 公告" },
  { id: "wuhan", name: "武汉", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4498, baseCap: 22488, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "changsha", name: "长沙", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4072, baseCap: 20361, dataYear: 2025, lastVerified: "2025-01 执行" },
  { id: "guangzhou", name: "广州", rates: { pension: 8, medical: 2, unemployment: 0.2, housing: 5 }, baseFloor: 5510, baseCap: 27549, dataYear: 2025, lastVerified: "2025-07 公告" },
  { id: "nanning", name: "南宁", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4143, baseCap: 20715, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "haikou", name: "海口", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4912.8, baseCap: 24564, dataYear: 2025, lastVerified: "2025 年度数据，待更新" },
  { id: "chengdu", name: "成都", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4588, baseCap: 22938, dataYear: 2025, lastVerified: "2025-10 执行" },
  { id: "guiyang", name: "贵阳", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4426.05, baseCap: 22130.25, dataYear: 2026, lastVerified: "2026 年度数据（依 2025 年社平）" },
  { id: "kunming", name: "昆明", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4357, baseCap: 21789, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "lasa", name: "拉萨", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 7066.2, baseCap: 35331, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "xian", name: "西安", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4650, baseCap: 23250, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "lanzhou", name: "兰州", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4403, baseCap: 22014, dataYear: 2025, lastVerified: "2025-01 执行" },
  { id: "xining", name: "西宁", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 5289.6, baseCap: 26448, dataYear: 2025, lastVerified: "2025 基准值 8816 元推算，待复核" },
  { id: "yinchuan", name: "银川", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4955, baseCap: 24774, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "wulumuqi", name: "乌鲁木齐", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 5069, baseCap: 25344, dataYear: 2025, lastVerified: "2025-09 公告" },
  // ---- 计划单列市 ----
  { id: "dalian", name: "大连", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4359, baseCap: 21792, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "qingdao", name: "青岛", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4573, baseCap: 22863, dataYear: 2026, lastVerified: "2026-07 公告" },
  { id: "ningbo", name: "宁波", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4986, baseCap: 25299, dataYear: 2025, lastVerified: "2025-01 执行" },
  { id: "xiamen", name: "厦门", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4043, baseCap: 22607, dataYear: 2026, lastVerified: "2026-07 公告" },
  { id: "shenzhen", name: "深圳", rates: { pension: 8, medical: 2, unemployment: 0.3, housing: 5 }, baseFloor: 4775, baseCap: 27549, dataYear: 2025, lastVerified: "2025-07 公告" },
  // ---- 经济强市 ----
  { id: "suzhou", name: "苏州", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4952, baseCap: 24762, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "wuxi", name: "无锡", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4952, baseCap: 24762, dataYear: 2025, lastVerified: "2025-09 公告" },
  { id: "dongguan", name: "东莞", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4775, baseCap: 27549, dataYear: 2025, lastVerified: "2025-07 公告" },
  { id: "foshan", name: "佛山", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4775, baseCap: 27549, dataYear: 2025, lastVerified: "2025-07 公告" },
  { id: "zhuhai", name: "珠海", rates: { pension: 8, medical: 2, unemployment: 0.5, housing: 5 }, baseFloor: 4775, baseCap: 27549, dataYear: 2025, lastVerified: "2025-07 公告" },
];

export const TAX_THRESHOLD = 5000; // 起征点（元/月）
export const ANNUAL_STANDARD_DEDUCTION = 60000; // 减除费用（元/年，年度汇算口径）

// 月度税率表：[上限, 税率, 速算扣除数]（按月预扣的简化估算口径；导出供 UI 展示七级表）
export const MONTHLY_BRACKETS: Array<[number, number, number]> = [
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

export type TaxBrackets = Array<[number, number, number]>;

/** 定位应纳税所得额所处的税率档下标（taxable ≤ 上限即命中，与 findBracket 口径一致；供 UI 高亮当前档） */
export function findBracketIndex(taxable: number, brackets: TaxBrackets = MONTHLY_BRACKETS): number {
  const t = num(taxable);
  for (let i = 0; i < brackets.length; i++) {
    if (t <= brackets[i][0]) return i;
  }
  return brackets.length - 1;
}

export function findBracket(
  taxable: number,
  brackets: TaxBrackets = MONTHLY_BRACKETS,
): { rate: number; quick: number; label: string } {
  const [, rate, quick] = brackets[findBracketIndex(taxable, brackets)];
  return { rate, quick, label: `${(rate * 100).toFixed(0)}%` };
}

/** 税率表第 index 档的区间文案（官方表述风格：不超过 X / 超过 X 至 Y / 超过 X） */
export function bracketRangeLabel(brackets: TaxBrackets, index: number): string {
  const i = Math.max(0, Math.min(index, brackets.length - 1));
  const lo = i === 0 ? 0 : brackets[i - 1][0];
  const hi = brackets[i][0];
  if (hi === Infinity) return `超过 ${money(lo)} 元`;
  if (lo === 0) return `不超过 ${money(hi)} 元`;
  return `超过 ${money(lo)} 元至 ${money(hi)} 元`;
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

/* ==================== 税前 ⇄ 税后互推 ==================== */

/** 已知税前算税后直接复用 calcTax；此处补齐反向：已知税后到手，反推税前月薪（二分求解） */
export interface ReverseCalcParams {
  rates: Rates;
  specialAdditional: number; // 专项附加扣除（元/月）
  applyBaseLimit: boolean; // 是否按社保基数上下限
  baseFloor: number;
  baseCap: number;
}

export interface ReverseCalcResult {
  target: number; // 目标税后到手（元/月；NaN/负数钳制为 0）
  gross: number; // 反推税前月薪（分级精度）
  insuranceTotal: number;
  taxable: number;
  bracket: { rate: number; quick: number; label: string };
  tax: number;
  takeHome: number; // 用反推税前正算出的税后（与目标差 < 0.01 元）
  residual: number; // |takeHome − target|（元）
  converged: boolean; // 是否在搜索区间内收敛（极端自定义比例导致目标不可达时为 false）
}

const REVERSE_SEARCH_WIDTH = 1e-4; // 二分终止宽度（元）
const REVERSE_MAX_ITER = 100;
const REVERSE_WINDOW_CENTS = 32; // 根附近逐分扫描窗口（分）；覆盖 r2 舍入抖动

/**
 * 已知税后到手，反推税前月薪。
 * 不变式：takeHome(g) = g − 五险一金(g) − 个税(g) 关于 g 整体单调不减（r2 舍入可造成 ≤ 0.01 元
 * 的局部抖动，由窗口扫描兜底），且 takeHome(g) ≤ g 恒成立，
 * 故在 [0, hi] 上可二分求根；收敛后在根附近的整分（0.01 元）候选中取正算税后最接近目标者，
 * 保证残差 < 0.01 元。五险一金与个税均为 calcTax 的完整口径（含基数封顶保底与速算扣除数）。
 */
export function calcGrossFromTakeHome(targetTakeHome: number, params: ReverseCalcParams): ReverseCalcResult {
  const target = Math.max(0, num(targetTakeHome));
  const forward = (g: number): TaxResult => calcTax({ ...params, salary: g });

  // 上界：无封顶时按 10 倍目标留足余量；有封顶/固定扣除时另加基数上限 2 倍，再兜底 10 万
  let lo = 0;
  let hi = Math.max(target * 10, target + num(params.baseCap) * 2) + 100000;
  const hiRes = forward(hi);
  if (hiRes.takeHome < target) {
    // 自定义比例极端（五险一金 + 边际税率 ≥ 100%）时目标不可达：返回上界并标记未收敛
    return {
      target,
      gross: r2(hi),
      insuranceTotal: hiRes.insuranceTotal,
      taxable: hiRes.taxable,
      bracket: hiRes.bracket,
      tax: hiRes.tax,
      takeHome: hiRes.takeHome,
      residual: r2(Math.abs(hiRes.takeHome - target)),
      converged: false,
    };
  }

  let iter = 0;
  while (hi - lo > REVERSE_SEARCH_WIDTH && iter < REVERSE_MAX_ITER) {
    const mid = (lo + hi) / 2;
    if (forward(mid).takeHome < target) lo = mid;
    else hi = mid;
    iter++;
  }

  // 分级精化：takeHome 经 r2 舍入，在保险项进位边界存在 ≤ 0.01 元的局部回落（非严格单调），
  // 二分可能停在"提前交叉点"；在根附近 ±32 分窗口内逐分扫描，取正算税后与目标残差最小者。
  const root = (lo + hi) / 2;
  const rootCent = Math.max(0, Math.round(root * 100));
  let bestCent = rootCent;
  let bestRes = forward(bestCent / 100);
  let bestResidual = Math.abs(bestRes.takeHome - target);
  for (let offset = -REVERSE_WINDOW_CENTS; offset <= REVERSE_WINDOW_CENTS; offset++) {
    const cent = Math.max(0, rootCent + offset);
    if (cent === bestCent) continue;
    const res = forward(cent / 100);
    const residual = Math.abs(res.takeHome - target);
    const closer = Math.abs(cent - rootCent) < Math.abs(bestCent - rootCent);
    if (residual < bestResidual || (residual === bestResidual && closer)) {
      bestResidual = residual;
      bestCent = cent;
      bestRes = res;
    }
  }
  const bestGross = bestCent / 100;

  return {
    target,
    gross: bestGross,
    insuranceTotal: bestRes.insuranceTotal,
    taxable: bestRes.taxable,
    bracket: bestRes.bracket,
    tax: bestRes.tax,
    takeHome: bestRes.takeHome,
    residual: r2(bestResidual),
    converged: true,
  };
}
