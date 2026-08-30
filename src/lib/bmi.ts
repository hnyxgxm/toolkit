/**
 * BMI 引擎（纯函数）
 *
 * 支持双口径：
 *  - 中国标准 WS/T 428-2013《成人体重判定》：偏瘦 <18.5 / 正常 18.5–<24 / 超重 24–<28 / 肥胖 ≥28
 *  - WHO 成人标准：偏瘦 <18.5 / 正常 18.5–<25 / 超重 25–<30 / 肥胖 ≥30
 *
 * 中心型肥胖腰围切点（WS/T 428-2013）：男 ≥90 cm、女 ≥85 cm。
 *
 * 设计要点：
 *  - 非法输入直接判为无效（不产生 NaN 甩给用户）；
 *  - 健康体重区间由当前标准的 BMI 正常区间反算：w = bmi × 身高²(m)，往返一致；
 *  - weightDeltaKg：>0 表示需增重、<0 表示需减重、0 表示已在健康区间。
 */

export type BmiCategory = "偏瘦" | "正常" | "超重" | "肥胖" | null;
export type BmiStandard = "china" | "who";
export type Sex = "male" | "female";

export interface BmiStandardInfo {
  id: BmiStandard;
  /** 完整标准名（UI 中标注在阈值旁） */
  name: string;
  /** 简称（切换按钮） */
  short: string;
  /** 口径来源说明 */
  source: string;
  normalMin: number; // 18.5
  overweightMin: number; // 24（中国）/ 25（WHO）
  obeseMin: number; // 28（中国）/ 30（WHO）
}

export const BMI_STANDARDS: Record<BmiStandard, BmiStandardInfo> = {
  china: {
    id: "china",
    name: "中国标准 WS/T 428-2013",
    short: "中国标准",
    source: "国家卫生行业标准《成人体重判定》（WS/T 428-2013）",
    normalMin: 18.5,
    overweightMin: 24,
    obeseMin: 28,
  },
  who: {
    id: "who",
    name: "WHO 标准",
    short: "WHO",
    source: "世界卫生组织（WHO）成人 BMI 分级标准",
    normalMin: 18.5,
    overweightMin: 25,
    obeseMin: 30,
  },
};

/** 中心型肥胖腰围切点（cm），口径：WS/T 428-2013 */
export const WAIST_CUTOFF_CM: Record<Sex, number> = { male: 90, female: 85 };

/** 成年/老年分界：仅用于提示，不参与 BMI 公式 */
export const ADULT_MIN_AGE = 18;
export const SENIOR_MIN_AGE = 65;

const HEIGHT_MIN = 80;
const HEIGHT_MAX = 250;
const WEIGHT_MIN = 10;
const WEIGHT_MAX = 400;
const AGE_MIN = 2;
const AGE_MAX = 120;
const WAIST_MIN = 40;
const WAIST_MAX = 200;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 中国标准分级（保留旧导出，兼容既有调用） */
export function classifyBmi(bmi: number): Exclude<BmiCategory, null> {
  return classifyBmiBy(bmi, "china");
}

/** 按指定标准分级（左闭右开：[下限, 上限)） */
export function classifyBmiBy(bmi: number, standard: BmiStandard): Exclude<BmiCategory, null> {
  const s = BMI_STANDARDS[standard];
  if (bmi < s.normalMin) return "偏瘦";
  if (bmi < s.overweightMin) return "正常";
  if (bmi < s.obeseMin) return "超重";
  return "肥胖";
}

/** 某身高在指定标准下的健康体重区间（kg），上限取 overweightMin − 0.1 保证往返一致 */
export function healthyWeightRange(heightCm: number, standard: BmiStandard): [number, number] {
  const m = heightCm / 100;
  const s = BMI_STANDARDS[standard];
  return [round1(s.normalMin * m * m), round1((s.overweightMin - 0.1) * m * m)];
}

export type WaistStatus = "central" | "normal" | "need-sex" | null;

/**
 * 腰围风险评估：男 ≥90 / 女 ≥85 cm 为中心型肥胖（WS/T 428-2013）。
 * 未提供腰围返回 null；提供了腰围但未提供性别返回 "need-sex"。
 */
export function assessWaist(waistCm?: number, sex?: Sex | null): WaistStatus {
  if (waistCm == null || !isFinite(waistCm)) return null;
  if (!sex) return "need-sex";
  return waistCm >= WAIST_CUTOFF_CM[sex] ? "central" : "normal";
}

export interface BmiInput {
  heightCm: number;
  weightKg: number;
  /** 默认 china（中国标准 WS/T 428-2013） */
  standard?: BmiStandard;
  /** 性别：不参与 BMI 公式，仅用于腰围判断 */
  sex?: Sex;
  /** 年龄（岁）：用于未成年人/老年人提示 */
  ageYears?: number;
  /** 腰围（cm）：可选 */
  waistCm?: number;
}

export interface BmiBoundary {
  category: Exclude<BmiCategory, null>;
  min: number;
  max: number;
  bmiMax: number; // 该档上边界（色带宽度用）
}

export interface BmiResult {
  valid: boolean;
  error?: string;
  bmi: number;
  category: BmiCategory;
  healthyWeightRange: [number, number]; // 该身高 × 当前标准对应的健康体重(kg)
  idealWeight: number; // BMI=22 的参考体重
  /** >0 需增重 | 0 已达标 | <0 需减重（kg，精确到 0.1） */
  weightDeltaKg: number;
  standard: BmiStandard;
  boundaries: BmiBoundary[];
  waist: {
    cm: number;
    status: Exclude<WaistStatus, null>;
    /** 性别对应切点；need-sex 时为 null */
    cutoff: number | null;
  } | null;
  /** 年龄提示：minor=未满 18 岁；senior=65 岁及以上 */
  ageNote: "minor" | "senior" | null;
}

function boundariesOf(standard: BmiStandard): BmiBoundary[] {
  const s = BMI_STANDARDS[standard];
  return [
    { category: "偏瘦", min: 0, max: s.normalMin, bmiMax: s.normalMin },
    { category: "正常", min: s.normalMin, max: s.overweightMin, bmiMax: s.overweightMin },
    { category: "超重", min: s.overweightMin, max: s.obeseMin, bmiMax: s.obeseMin },
    { category: "肥胖", min: s.obeseMin, max: 40, bmiMax: 40 },
  ];
}

export function calcBmi({
  heightCm,
  weightKg,
  standard = "china",
  sex,
  ageYears,
  waistCm,
}: BmiInput): BmiResult {
  const boundaries = boundariesOf(standard);
  const invalid = (error: string): BmiResult => ({
    valid: false, error, bmi: NaN, category: null,
    healthyWeightRange: [0, 0], idealWeight: 0, weightDeltaKg: 0,
    standard, boundaries, waist: null, ageNote: null,
  });

  if (!isFinite(heightCm) || !isFinite(weightKg)) return invalid("请输入有效的身高和体重");
  if (heightCm < HEIGHT_MIN || heightCm > HEIGHT_MAX) return invalid(`身高需在 ${HEIGHT_MIN}–${HEIGHT_MAX} cm 之间`);
  if (weightKg < WEIGHT_MIN || weightKg > WEIGHT_MAX) return invalid(`体重需在 ${WEIGHT_MIN}–${WEIGHT_MAX} kg 之间`);
  if (ageYears != null && (!isFinite(ageYears) || ageYears < AGE_MIN || ageYears > AGE_MAX)) {
    return invalid(`年龄需在 ${AGE_MIN}–${AGE_MAX} 岁之间`);
  }
  if (waistCm != null && (!isFinite(waistCm) || waistCm < WAIST_MIN || waistCm > WAIST_MAX)) {
    return invalid(`腰围需在 ${WAIST_MIN}–${WAIST_MAX} cm 之间`);
  }

  const m = heightCm / 100;
  const bmi = round1(weightKg / (m * m));
  const [wMin, wMax] = healthyWeightRange(heightCm, standard);

  const weightDeltaKg = weightKg > wMax ? round1(wMax - weightKg) : weightKg < wMin ? round1(wMin - weightKg) : 0;

  const ageNote = ageYears == null ? null : ageYears < ADULT_MIN_AGE ? "minor" : ageYears >= SENIOR_MIN_AGE ? "senior" : null;

  const waistValid = waistCm != null && isFinite(waistCm);
  const waistStatus = assessWaist(waistCm, sex ?? null);

  return {
    valid: true,
    bmi,
    category: classifyBmiBy(bmi, standard),
    healthyWeightRange: [wMin, wMax],
    idealWeight: round1(22 * m * m),
    weightDeltaKg,
    standard,
    boundaries,
    waist: waistValid
      ? {
          cm: waistCm,
          status: waistStatus as Exclude<WaistStatus, null>,
          cutoff: sex ? WAIST_CUTOFF_CM[sex] : null,
        }
      : null,
    ageNote,
  };
}
