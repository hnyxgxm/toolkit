/**
 * BMI 引擎（纯函数）
 * 采用《中国成人超重和肥胖症预防控制指南》标准：
 *   <18.5 偏瘦 / 18.5–23.9 正常 / 24–27.9 超重 / ≥28 肥胖
 * 设计要点：非法输入直接判为无效（不产生 NaN 甩给用户），并给出健康体重区间。
 */

export type BmiCategory = "偏瘦" | "正常" | "超重" | "肥胖" | null;

export interface BmiInput {
  heightCm: number;
  weightKg: number;
}

export interface BmiResult {
  valid: boolean;
  error?: string;
  bmi: number;
  category: BmiCategory;
  healthyWeightRange: [number, number]; // 该身高对应的健康体重(kg)
  idealWeight: number; // BMI=22 的参考体重
  boundaries: Array<{ category: Exclude<BmiCategory, null>; min: number; max: number; bmiMax: number }>;
}

const HEIGHT_MIN = 80;
const HEIGHT_MAX = 250;
const WEIGHT_MIN = 10;
const WEIGHT_MAX = 400;

export function classifyBmi(bmi: number): Exclude<BmiCategory, null> {
  if (bmi < 18.5) return "偏瘦";
  if (bmi < 24) return "正常";
  if (bmi < 28) return "超重";
  return "肥胖";
}

export function calcBmi({ heightCm, weightKg }: BmiInput): BmiResult {
  const boundaries = [
    { category: "偏瘦" as const, min: 0, max: 18.5, bmiMax: 18.5 },
    { category: "正常" as const, min: 18.5, max: 24, bmiMax: 24 },
    { category: "超重" as const, min: 24, max: 28, bmiMax: 28 },
    { category: "肥胖" as const, min: 28, max: 40, bmiMax: 40 },
  ];
  const invalid = (error: string): BmiResult => ({
    valid: false, error, bmi: NaN, category: null,
    healthyWeightRange: [0, 0], idealWeight: 0, boundaries,
  });

  if (!isFinite(heightCm) || !isFinite(weightKg)) return invalid("请输入有效的身高和体重");
  if (heightCm < HEIGHT_MIN || heightCm > HEIGHT_MAX) return invalid(`身高需在 ${HEIGHT_MIN}–${HEIGHT_MAX} cm 之间`);
  if (weightKg < WEIGHT_MIN || weightKg > WEIGHT_MAX) return invalid(`体重需在 ${WEIGHT_MIN}–${WEIGHT_MAX} kg 之间`);

  const m = heightCm / 100;
  const bmi = Math.round((weightKg / (m * m)) * 10) / 10;
  return {
    valid: true,
    bmi,
    category: classifyBmi(bmi),
    healthyWeightRange: [Math.round(18.5 * m * m * 10) / 10, Math.round(23.9 * m * m * 10) / 10],
    idealWeight: Math.round(22 * m * m * 10) / 10,
    boundaries,
  };
}
