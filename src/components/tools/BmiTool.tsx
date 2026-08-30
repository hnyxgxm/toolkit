"use client";

import { useMemo, useState } from "react";
import { PageHeader, Field, NumberInput, Stat, Hint } from "@/components/ui";
import { calcBmi } from "@/lib/bmi";

const CAT_COLOR: Record<string, string> = {
  偏瘦: "text-sky-400",
  正常: "text-emerald-400",
  超重: "text-amber-400",
  肥胖: "text-red-400",
};

export default function BmiTool() {
  const [h, setH] = useState("170");
  const [w, setW] = useState("65");
  const res = useMemo(() => calcBmi({ heightCm: Number(h), weightKg: Number(w) }), [h, w]);

  // 进度条：把 BMI 映射到 14~40 刻度
  const pct = res.valid ? Math.max(0, Math.min(100, ((res.bmi - 14) / (40 - 14)) * 100)) : 0;

  return (
    <div>
      <PageHeader badge="生活" title="BMI 计算器" subtitle="身体质量指数 · 中国成人标准分级" tone="violet" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-lg mb-6">
        <Field label="身高" hint="cm，80–250" error={res.valid || !h ? undefined : "身高需在 80–250 cm"}>
          <NumberInput value={h} onChange={setH} suffix="cm" min={80} max={250} invalid={res.valid === false && !!h} />
        </Field>
        <Field label="体重" hint="kg，10–400" error={res.valid || !w ? undefined : "体重需在 10–400 kg"}>
          <NumberInput value={w} onChange={setW} suffix="kg" min={10} max={400} invalid={res.valid === false && !!w} />
        </Field>
      </div>

      {!res.valid ? (
        <Hint kind="error">{res.error ?? "请输入身高和体重"}</Hint>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="你的 BMI" value={res.bmi.toFixed(1)} emphasis tone="accent" />
            <Stat label="分级" value={res.category} tone="default" />
            <Stat label="健康体重区间" value={`${res.healthyWeightRange[0]}–${res.healthyWeightRange[1]}`} unit="kg" />
            <Stat label="参考理想体重" value={res.idealWeight} unit="kg" />
          </div>

          {/* 可视化分级条 */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex justify-between text-[10px] font-mono text-neutral-500 mb-2">
              <span>14</span><span>18.5</span><span>24</span><span>28</span><span>40</span>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden flex">
              <div className="bg-sky-500/40" style={{ width: `${((18.5 - 14) / 26) * 100}%` }} />
              <div className="bg-emerald-500/40" style={{ width: `${((24 - 18.5) / 26) * 100}%` }} />
              <div className="bg-amber-500/40" style={{ width: `${((28 - 24) / 26) * 100}%` }} />
              <div className="bg-red-500/40" style={{ width: `${((40 - 28) / 26) * 100}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded shadow" style={{ left: `${pct}%` }} />
            </div>
            <div className={`mt-3 text-sm font-mono ${CAT_COLOR[res.category ?? "正常"]}`}>
              当前 {res.bmi.toFixed(1)} · {res.category}
            </div>
          </div>

          {/* 标准表 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {res.boundaries.map((b) => (
              <div key={b.category} className={`p-3 rounded-lg border text-center ${res.category === b.category ? "border-white/20 bg-white/[0.05]" : "border-white/[0.06]"}`}>
                <div className={`text-sm font-semibold ${CAT_COLOR[b.category]}`}>{b.category}</div>
                <div className="text-xs font-mono text-neutral-500">{b.min} – {b.max}</div>
              </div>
            ))}
          </div>
          <Hint kind="info">BMI 仅供参考，肌肉量高者可能误判为超重；健康评估请结合体脂率与专业意见。</Hint>
        </div>
      )}
    </div>
  );
}
