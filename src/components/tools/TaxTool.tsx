"use client";

import { useMemo, useState } from "react";
import { PageHeader, Toggle, Field, NumberInput, Stat, Hint, AssumptionNote, CopyButton } from "@/components/ui";
import { calcTax, CITY_PRESETS, TAX_THRESHOLD, type Rates } from "@/lib/tax";
import { money } from "@/lib/format";

const QUICK = [5000, 10000, 15000, 25000, 50000];

export default function TaxTool() {
  const [cityId, setCityId] = useState("shanghai");
  const city = CITY_PRESETS.find((c) => c.id === cityId)!;
  const [rates, setRates] = useState<Rates>(city.rates);
  const [custom, setCustom] = useState(false);
  const [salary, setSalary] = useState("25000");
  const [special, setSpecial] = useState("0");
  const [applyBase, setApplyBase] = useState(false);

  const pickCity = (id: string) => {
    setCityId(id);
    const c = CITY_PRESETS.find((x) => x.id === id)!;
    if (!custom) setRates(c.rates);
  };

  const result = useMemo(
    () =>
      calcTax({
        salary: Number(salary) || 0,
        rates,
        specialAdditional: Number(special) || 0,
        applyBaseLimit: applyBase,
        baseFloor: city.baseFloor,
        baseCap: city.baseCap,
      }),
    [salary, rates, special, applyBase, city],
  );

  const totalRate = rates.pension + rates.medical + rates.unemployment + rates.housing;

  return (
    <div>
      <PageHeader badge="生活" title="个税计算器" subtitle="五险一金 · 个税 · 到手工资（口径透明）" tone="emerald" />

      <div className="space-y-6">
        {/* 1 城市 / 比例 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">① 参保城市（决定个人比例）</span>
            <Toggle checked={custom} onChange={(v) => { setCustom(v); if (!v) setRates(city.rates); }} label="自定义比例" />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {CITY_PRESETS.map((c) => (
              <button
                key={c.id}
                onClick={() => pickCity(c.id)}
                disabled={custom}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                  c.id === cityId && !custom
                    ? "bg-white text-black border-white"
                    : "text-neutral-400 border-white/[0.06] hover:border-white/20"
                } ${custom ? "opacity-40" : ""}`}
              >
                {c.name} {(c.rates.pension + c.rates.medical + c.rates.unemployment + c.rates.housing).toFixed(1)}%
              </button>
            ))}
          </div>
          {custom && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["pension", "medical", "unemployment", "housing"] as const).map((k) => (
                <Field key={k} label={{ pension: "养老%", medical: "医疗%", unemployment: "失业%", housing: "公积金%" }[k]}>
                  <NumberInput value={rates[k]} onChange={(v) => setRates({ ...rates, [k]: Number(v) || 0 })} suffix="%" step={0.1} />
                </Field>
              ))}
            </div>
          )}
        </div>

        {/* 2 收入与扣除 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="② 税前月薪" hint="元/月">
            <NumberInput value={salary} onChange={setSalary} suffix="元" min={0} />
          </Field>
          <Field label="专项附加扣除" hint="子女教育/房贷/赡养老人等，元/月">
            <NumberInput value={special} onChange={setSpecial} suffix="元" min={0} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} onClick={() => setSalary(String(q))} className="px-2.5 py-1 rounded-md text-xs font-mono text-neutral-400 border border-white/[0.06] hover:border-white/20 hover:text-white transition-all">
              {q / 10000}万
            </button>
          ))}
        </div>

        {/* 3 社保基数上下限 */}
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <Toggle checked={applyBase} onChange={setApplyBase} label="③ 按社保缴费基数上下限调整" hint={`下限 ${money(city.baseFloor)} / 上限 ${money(city.baseCap)}`} />
          <p className="mt-2 text-[11px] font-mono text-neutral-600">
            关闭时五险一金按全额工资计（便于快速估算）；开启后缴费基数会在 {money(city.baseFloor)}~{money(city.baseCap)} 间封顶保底，更接近真实工资条。
          </p>
        </div>

        {/* 假设透明 */}
        <AssumptionNote
          items={[
            { k: "当前比例", v: `个人合计 ${totalRate.toFixed(1)}%` },
            { k: "起征点", v: `${TAX_THRESHOLD} 元/月` },
            { k: "计算口径", v: "月度税率表（非年度累计）" },
            { k: "城市", v: custom ? "自定义" : city.name },
            { k: "提示", v: "实际以参保地政策为准" },
          ]}
        />

        {/* 结果 */}
        {salary && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="五险一金(个人)" value={`-${money(result.insuranceTotal)}`} tone="warn" />
              <Stat label="应纳税所得额" value={money(result.taxable)} />
              <Stat label="应缴个税" value={money(result.tax)} tone="bad" />
              <Stat label="税后到手" value={money(result.takeHome)} emphasis tone="good" />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="text-xs font-mono text-neutral-500 mb-3 uppercase tracking-wider">计算明细</div>
              <div className="space-y-1.5 font-mono text-sm">
                {result.breakdown.map((b) => (
                  <div key={b.key} className="flex justify-between text-neutral-400">
                    <span>{b.label} {b.rate}%</span>
                    <span className="text-neutral-300">-{money(b.amount)}</span>
                  </div>
                ))}
                <div className="border-t border-white/[0.06] my-2" />
                <div className="flex justify-between text-neutral-400"><span>五险一金合计</span><span>-{money(result.insuranceTotal)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>起征点</span><span>-{TAX_THRESHOLD.toLocaleString()}</span></div>
                {Number(special) > 0 && <div className="flex justify-between text-neutral-400"><span>专项附加扣除</span><span>-{money(Number(special))}</span></div>}
                <div className="flex justify-between text-neutral-200 mt-1"><span>应纳税所得额</span><span>{money(result.taxable)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>税率 / 速算扣除</span><span>{result.bracket.label} · {result.bracket.quick}</span></div>
                <div className="flex justify-between text-red-300"><span>应缴个税</span><span>{money(result.tax)}</span></div>
                <div className="flex justify-between text-emerald-300 text-base font-semibold mt-2"><span>税后到手</span><span>{money(result.takeHome)} 元/月</span></div>
                <div className="flex justify-between text-neutral-500"><span>年到手</span><span>{money(result.yearTakeHome)}</span></div>
                <div className="flex justify-between text-neutral-500"><span>公积金个人账户入账</span><span>{money(result.housingFundPersonal * 2)}（含单位）</span></div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs font-mono text-neutral-600">
                <span>可复制核对：</span>
                <code className="text-neutral-400">
                  {salary} − {money(result.insuranceTotal)} − {money(result.tax)} = {money(result.takeHome)}
                </code>
                <CopyButton text={`${salary} − ${result.insuranceTotal} − ${result.tax} = ${result.takeHome}`} />
              </div>
            </div>

            {Number(salary) > 0 && (
              <Hint kind="success">
                自校验通过：税前 − 五险一金 − 个税 = 到手 = {money(result.takeHome)} 元，无舍入缺口。
              </Hint>
            )}
          </>
        )}
      </div>
    </div>
  );
}
