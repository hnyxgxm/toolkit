"use client";

import { useMemo, useState } from "react";
import {
  PageHeader,
  Field,
  NumberInput,
  Stat,
  Hint,
  Segmented,
  AssumptionNote,
  Badge,
} from "@/components/ui";
import {
  calcBmi,
  BMI_STANDARDS,
  WAIST_CUTOFF_CM,
  type BmiStandard,
  type Sex,
  type BmiCategory,
} from "@/lib/bmi";

const CAT_COLOR: Record<Exclude<BmiCategory, null>, string> = {
  偏瘦: "text-sky-400",
  正常: "text-emerald-400",
  超重: "text-amber-400",
  肥胖: "text-red-400",
};

const CAT_TONE: Record<Exclude<BmiCategory, null>, "accent" | "good" | "warn" | "bad"> = {
  偏瘦: "accent",
  正常: "good",
  超重: "warn",
  肥胖: "bad",
};

/* 色带标尺刻度范围 */
const BAND_MIN = 14;
const BAND_MAX = 40;
const pctOf = (bmi: number) => Math.max(0, Math.min(100, ((bmi - BAND_MIN) / (BAND_MAX - BAND_MIN)) * 100));

export default function BmiTool() {
  const [h, setH] = useState("170");
  const [w, setW] = useState("65");
  const [standard, setStandard] = useState<BmiStandard>("china");
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("");
  const [waist, setWaist] = useState("");

  const res = useMemo(
    () =>
      calcBmi({
        heightCm: Number(h),
        weightKg: Number(w),
        standard,
        sex,
        ageYears: age.trim() === "" ? undefined : Number(age),
        waistCm: waist.trim() === "" ? undefined : Number(waist),
      }),
    [h, w, standard, sex, age, waist]
  );

  const std = BMI_STANDARDS[standard];
  const cat = res.valid ? (res.category as Exclude<BmiCategory, null>) : null;

  /* 色带：按当前标准切点分段 */
  const edges = [BAND_MIN, std.normalMin, std.overweightMin, std.obeseMin, BAND_MAX];
  const segColors = ["bg-sky-500/40", "bg-emerald-500/40", "bg-amber-500/40", "bg-red-500/40"];
  const segWidths = edges.slice(0, -1).map((e, i) => ((edges[i + 1] - e) / (BAND_MAX - BAND_MIN)) * 100);

  return (
    <div>
      <PageHeader
        badge="生活"
        title="BMI 计算器"
        subtitle="身体质量指数 · 中国标准 WS/T 428-2013 与 WHO 双口径 · 非医疗诊断"
        tone="violet"
      />

      {/* 标准切换：每档阈值旁标注标准名 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6">
        <Segmented
          value={standard}
          onChange={setStandard}
          ariaLabel="分级标准"
          options={[
            { value: "china", label: "中国标准" },
            { value: "who", label: "WHO" },
          ]}
        />
        <span className="text-xs font-mono text-neutral-500">
          偏瘦 &lt;{std.normalMin} · 正常 {std.normalMin}–{round1(std.overweightMin - 0.1)} · 超重{" "}
          {std.overweightMin}–{round1(std.obeseMin - 0.1)} · 肥胖 ≥{std.obeseMin}
          <span className="text-neutral-600">（{std.name}）</span>
        </span>
      </div>

      {/* 输入区 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
        <Field label="身高" hint="cm，80–250" error={res.valid || !h ? undefined : "身高需在 80–250 cm"}>
          <NumberInput value={h} onChange={setH} suffix="cm" invalid={res.valid === false && !!h} />
        </Field>
        <Field label="体重" hint="kg，10–400" error={res.valid || !w ? undefined : "体重需在 10–400 kg"}>
          <NumberInput value={w} onChange={setW} suffix="kg" invalid={res.valid === false && !!w} />
        </Field>
        <Field label="年龄" hint="岁，可选">
          <NumberInput value={age} onChange={setAge} suffix="岁" placeholder="选填" />
        </Field>
        <Field label="性别" hint="用于腰围判断">
          <div>
            <Segmented
              value={sex}
              onChange={setSex}
              ariaLabel="性别"
              options={[
                { value: "male" as Sex, label: "男" },
                { value: "female" as Sex, label: "女" },
              ]}
            />
          </div>
        </Field>
        <Field label="腰围" hint={`可选 · 男≥${WAIST_CUTOFF_CM.male}/女≥${WAIST_CUTOFF_CM.female}cm 提示中心型肥胖`} error={res.valid || !waist ? undefined : "腰围需在 40–200 cm"}>
          <NumberInput value={waist} onChange={setWaist} suffix="cm" placeholder="选填" invalid={res.valid === false && !!waist} />
        </Field>
      </div>

      {!res.valid ? (
        <Hint kind="error">{res.error ?? "请输入身高和体重"}</Hint>
      ) : (
        <div className="space-y-6">
          {/* 结果统计 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="你的 BMI" value={res.bmi.toFixed(1)} emphasis tone="accent" />
            <Stat label={`分级 · ${std.name}`} value={<span className={cat ? CAT_COLOR[cat] : undefined}>{res.category}</span>} tone={cat ? CAT_TONE[cat] : "default"} />
            <Stat
              label={`健康体重区间（${std.short}）`}
              value={`${res.healthyWeightRange[0]}–${res.healthyWeightRange[1]}`}
              unit="kg"
            />
            <Stat
              label={res.weightDeltaKg === 0 ? "健康状态" : res.weightDeltaKg > 0 ? "建议增重" : "建议减重"}
              value={
                res.weightDeltaKg === 0 ? (
                  "已达标"
                ) : (
                  `${res.weightDeltaKg > 0 ? "+" : "−"}${Math.abs(res.weightDeltaKg).toFixed(1)}`
                )
              }
              unit={res.weightDeltaKg === 0 ? undefined : "kg"}
              tone={res.weightDeltaKg === 0 ? "good" : res.weightDeltaKg > 0 ? "accent" : "warn"}
            />
          </div>

          {/* 横向色带标尺 + 位置指针 */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-500">BMI 标尺 · 当前位置</span>
              <Badge tone="violet">{std.name}</Badge>
            </div>
            <div className="relative">
              <div className="relative h-3 rounded-full overflow-hidden flex">
                {segWidths.map((width, i) => (
                  <div key={i} className={segColors[i]} style={{ width: `${width}%` }} />
                ))}
                {/* 指针 */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-7 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                  style={{ left: `${pctOf(res.bmi)}%` }}
                />
              </div>
              {/* 刻度标注 */}
              <div className="relative h-5 mt-1.5 text-[10px] font-mono text-neutral-500">
                <span className="absolute -translate-x-0" style={{ left: 0 }}>{BAND_MIN}</span>
                {[std.normalMin, std.overweightMin, std.obeseMin].map((b) => (
                  <span key={b} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pctOf(b)}%` }}>
                    {b}
                  </span>
                ))}
                <span className="absolute right-0">{BAND_MAX}</span>
              </div>
            </div>
            <div className={`mt-2 text-sm font-mono ${cat ? CAT_COLOR[cat] : ""}`}>
              当前 {res.bmi.toFixed(1)} · {res.category}
            </div>
            <p className="mt-1 text-[10px] font-mono text-neutral-600">口径来源：{std.source}</p>
          </div>

          {/* 分级阈值表（随标准切换，标准名标注） */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-mono uppercase tracking-widest text-neutral-600">分级阈值</h2>
              <span className="text-[10px] font-mono text-neutral-600">· {std.name}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {res.boundaries.map((b) => (
                <div
                  key={b.category}
                  className={`card-hover p-3 rounded-xl border text-center ${
                    res.category === b.category ? "border-white/20 bg-white/[0.05]" : "border-white/[0.06]"
                  }`}
                >
                  <div className={`text-sm font-semibold ${CAT_COLOR[b.category]}`}>{b.category}</div>
                  <div className="text-xs font-mono text-neutral-500 tabular-nums">
                    {b.category === "偏瘦" ? (
                      `< ${b.max}`
                    ) : b.category === "肥胖" ? (
                      `≥ ${b.min}`
                    ) : (
                      `${b.min} – ${round1(b.max - 0.1)}`
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 腰围评估（可选输入） */}
          {res.waist && (
            <>
              {res.waist.status === "central" && sex && (
                <Hint kind="warn">
                  腰围 {res.waist.cm} cm ≥ {res.waist.cutoff} cm（{sex === "male" ? "男" : "女"}），提示
                  <strong className="mx-1">中心型肥胖风险</strong>
                  · 口径：WS/T 428-2013（男 ≥{WAIST_CUTOFF_CM.male} / 女 ≥{WAIST_CUTOFF_CM.female} cm）。中心型肥胖与代谢疾病风险相关，建议进一步检查。
                </Hint>
              )}
              {res.waist.status === "normal" && (
                <Hint kind="info">
                  腰围 {res.waist.cm} cm 未达中心型肥胖切点（男 ≥{WAIST_CUTOFF_CM.male} / 女 ≥{WAIST_CUTOFF_CM.female} cm · WS/T 428-2013）。
                </Hint>
              )}
              {res.waist.status === "need-sex" && (
                <Hint kind="info">
                  已填写腰围：请先选择性别，再评估中心型肥胖风险（男 ≥{WAIST_CUTOFF_CM.male} / 女 ≥{WAIST_CUTOFF_CM.female} cm · WS/T 428-2013）。
                </Hint>
              )}
            </>
          )}

          {/* 年龄提示 */}
          {res.ageNote === "minor" && (
            <Hint kind="warn">
              未满 18 岁不适用成人 BMI 标准，请参考学龄儿童青少年筛查标准（WS/T 586-2018），以下结果仅供参考。
            </Hint>
          )}
          {res.ageNote === "senior" && (
            <Hint kind="info">
              65 岁及以上老年人适宜 BMI 范围可适当放宽（约 20.0–26.9，参考国家卫健委《体重管理指导原则（2024 年版）》）。
            </Hint>
          )}

          {/* 假设与口径 */}
          <AssumptionNote
            items={[
              { k: "BMI 公式", v: "体重(kg) ÷ 身高²(m²)" },
              { k: "分级口径", v: std.source },
              { k: "健康区间", v: `${std.normalMin} – ${round1(std.overweightMin - 0.1)} × 身高²` },
              { k: "理想体重", v: "按 BMI = 22 反算" },
              { k: "腰围切点", v: `男 ≥${WAIST_CUTOFF_CM.male} / 女 ≥${WAIST_CUTOFF_CM.female} cm（WS/T 428-2013）` },
              { k: "结果性质", v: "健康筛查参考 · 非医疗诊断" },
            ]}
          />

          <Hint kind="info">
            本工具输出仅为健康筛查参考，<strong className="mx-1">非医疗诊断</strong>；肌肉量高者可能被误判为超重，健康评估请结合体脂率、腰臀比等指标并咨询专业医生。
          </Hint>
        </div>
      )}
    </div>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
