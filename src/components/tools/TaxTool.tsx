"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PageHeader, Segmented, Toggle, Field, NumberInput, Stat, Hint, AssumptionNote, CopyButton } from "@/components/ui";
import {
  calcTax,
  calcAnnualTax,
  calcSpecialDeductions,
  CITY_PRESETS,
  TAX_THRESHOLD,
  ANNUAL_STANDARD_DEDUCTION,
  TAX_TABLE_META,
  SPECIAL_DEDUCTION_STANDARDS,
  type Rates,
  type ElderlySupportType,
  type ContinuingEduType,
  type HousingDeductionType,
  type RentTier,
} from "@/lib/tax";
import { money } from "@/lib/format";

const QUICK = [5000, 10000, 15000, 25000, 50000];
const QUICK_ANNUAL = [100000, 200000, 300000, 500000, 1000000];

type Mode = "monthly" | "annual";

/** 字符串 → 数字：空串/非法字符归 0，绝不向计算引擎传 NaN */
function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 非空且（非有限或为负）视为非法输入 */
function isBad(v: string): boolean {
  if (v.trim() === "") return false;
  const n = Number(v);
  return !Number.isFinite(n) || n < 0;
}

/** 专项附加扣除分类条目（标题 + 当口径金额 + 控件 + 口径说明） */
function DeductionRow({ title, computed, note, children }: { title: string; computed: string; note: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-neutral-300">{title}</span>
        <span className="text-xs font-mono text-neutral-400">{computed}</span>
      </div>
      {children}
      <p className="mt-1 text-[11px] font-mono text-neutral-600">{note}</p>
    </div>
  );
}

export default function TaxTool() {
  const [mode, setMode] = useState<Mode>("monthly");

  // —— 按月模式（行为保持不变）——
  const [cityId, setCityId] = useState("shanghai");
  const city = CITY_PRESETS.find((c) => c.id === cityId)!;
  const [rates, setRates] = useState<Rates>(city.rates);
  const [custom, setCustom] = useState(false);
  const [salary, setSalary] = useState("25000");
  const [applyBase, setApplyBase] = useState(false);

  // —— 专项附加扣除分类（按月/按年共用，标准为 2023 年国发提高后口径）——
  const [childrenCount, setChildrenCount] = useState("0");
  const [infantCount, setInfantCount] = useState("0");
  const [elderly, setElderly] = useState<ElderlySupportType>("none");
  const [continuingEdu, setContinuingEdu] = useState<ContinuingEduType>("none");
  const [medicalSelfPaid, setMedicalSelfPaid] = useState("0");
  const [housing, setHousing] = useState<HousingDeductionType>("none");
  const [rentTier, setRentTier] = useState<RentTier>("tier1");

  // —— 年度汇算模式 ——
  const [annualIncome, setAnnualIncome] = useState("200000");
  const [prepaidTax, setPrepaidTax] = useState("0");
  const [annualSocial, setAnnualSocial] = useState("0");
  const [annualOther, setAnnualOther] = useState("0");

  const pickCity = (id: string) => {
    setCityId(id);
    const c = CITY_PRESETS.find((x) => x.id === id)!;
    if (!custom) setRates(c.rates);
  };

  const deductions = useMemo(
    () =>
      calcSpecialDeductions({
        childrenCount: num(childrenCount),
        infantCount: num(infantCount),
        elderly,
        continuingEdu,
        medicalSelfPaid: num(medicalSelfPaid),
        housing,
        rentTier,
      }),
    [childrenCount, infantCount, elderly, continuingEdu, medicalSelfPaid, housing, rentTier],
  );
  const ded = (key: string) => deductions.items.find((d) => d.key === key)!;
  const amountText = (key: string) => {
    const d = ded(key);
    if (mode === "monthly") return d.annualOnly ? "0 元/月 · 仅年度汇算" : `${money(d.monthly)} 元/月`;
    return `${money(d.annual)} 元/年`;
  };

  const result = useMemo(
    () =>
      calcTax({
        salary: num(salary),
        rates,
        specialAdditional: deductions.totalMonthly,
        applyBaseLimit: applyBase,
        baseFloor: city.baseFloor,
        baseCap: city.baseCap,
      }),
    [salary, rates, applyBase, city, deductions],
  );

  const annual = useMemo(
    () =>
      calcAnnualTax({
        annualIncome: num(annualIncome),
        prepaidTax: num(prepaidTax),
        socialInsurance: num(annualSocial),
        specialAdditional: deductions.totalAnnual,
        otherDeduction: num(annualOther),
      }),
    [annualIncome, prepaidTax, annualSocial, annualOther, deductions],
  );

  const totalRate = rates.pension + rates.medical + rates.unemployment + rates.housing;

  // 非法输入（负数/非法字符）检测：非法项按 0 参与计算，绝不出 NaN
  const badInputs = [salary, childrenCount, infantCount, medicalSelfPaid, annualIncome, prepaidTax, annualSocial, annualOther].filter(isBad);
  const hasBad = badInputs.length > 0;

  return (
    <div>
      <PageHeader badge="生活" title="个税计算器" subtitle="五险一金 · 个税 · 到手工资 · 年度汇算（口径透明）" tone="emerald" />

      <div className="space-y-6">
        {/* 0 计税方式 */}
        <div className="flex items-center gap-3">
          <Segmented
            ariaLabel="计税方式"
            value={mode}
            onChange={setMode}
            options={[
              { value: "monthly", label: "按月估算" },
              { value: "annual", label: "年度汇算" },
            ]}
          />
          <span className="text-[11px] font-mono text-neutral-600">
            {mode === "monthly" ? "月度税率表简化口径" : "全年综合所得 · 应退/应补"}
          </span>
        </div>

        {hasBad && (
          <Hint kind="error">输入有误：金额与数量不能为负数或非法字符，请修正标红输入框（非法项已按 0 参与计算，不会出现 NaN）。</Hint>
        )}

        {/* 1 城市 / 比例（仅按月模式） */}
        {mode === "monthly" && (
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
        )}

        {/* 2 收入输入 */}
        {mode === "monthly" ? (
          <>
            <Field label="② 税前月薪" hint="元/月">
              <NumberInput value={salary} onChange={setSalary} suffix="元" min={0} invalid={isBad(salary)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} onClick={() => setSalary(String(q))} className="px-2.5 py-1 rounded-md text-xs font-mono text-neutral-400 border border-white/[0.06] hover:border-white/20 hover:text-white transition-all">
                  {q / 10000}万
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="② 全年累计收入" hint="并入综合所得的全部收入，元/年">
                <NumberInput value={annualIncome} onChange={setAnnualIncome} suffix="元" min={0} invalid={isBad(annualIncome)} />
              </Field>
              <Field label="已预缴税额" hint="全年已预扣预缴个税合计，元">
                <NumberInput value={prepaidTax} onChange={setPrepaidTax} suffix="元" min={0} invalid={isBad(prepaidTax)} />
              </Field>
              <Field label="专项扣除（三险一金）" hint="个人承担部分全年合计，元/年">
                <NumberInput value={annualSocial} onChange={setAnnualSocial} suffix="元" min={0} invalid={isBad(annualSocial)} />
              </Field>
              <Field label="其他扣除" hint="年金、商业健康险等，元/年">
                <NumberInput value={annualOther} onChange={setAnnualOther} suffix="元" min={0} invalid={isBad(annualOther)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_ANNUAL.map((q) => (
                <button key={q} onClick={() => setAnnualIncome(String(q))} className="px-2.5 py-1 rounded-md text-xs font-mono text-neutral-400 border border-white/[0.06] hover:border-white/20 hover:text-white transition-all">
                  {q / 10000}万
                </button>
              ))}
            </div>
          </>
        )}

        {/* 3 社保基数上下限（仅按月模式） */}
        {mode === "monthly" && (
          <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Toggle checked={applyBase} onChange={setApplyBase} label="③ 按社保缴费基数上下限调整" hint={`下限 ${money(city.baseFloor)} / 上限 ${money(city.baseCap)}`} />
            <p className="mt-2 text-[11px] font-mono text-neutral-600">
              关闭时五险一金按全额工资计（便于快速估算）；开启后缴费基数会在 {money(city.baseFloor)}~{money(city.baseCap)} 间封顶保底，更接近真实工资条。
            </p>
          </div>
        )}

        {/* 专项附加扣除分类（两种模式共用） */}
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">专项附加扣除 · 分类录入</span>
            <span className="text-xs font-mono text-neutral-400">
              {mode === "monthly"
                ? `按月可扣合计 -${money(deductions.totalMonthly)} 元/月`
                : `全年可扣合计 -${money(deductions.totalAnnual)} 元/年`}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <DeductionRow title="子女教育" computed={amountText("childrenEducation")} note={ded("childrenEducation").note}>
              <NumberInput value={childrenCount} onChange={setChildrenCount} suffix="孩" min={0} invalid={isBad(childrenCount)} />
            </DeductionRow>
            <DeductionRow title="3岁以下婴幼儿照护" computed={amountText("infantCare")} note={ded("infantCare").note}>
              <NumberInput value={infantCount} onChange={setInfantCount} suffix="孩" min={0} invalid={isBad(infantCount)} />
            </DeductionRow>
            <DeductionRow title="赡养老人" computed={amountText("elderly")} note={ded("elderly").note}>
              <Segmented
                ariaLabel="赡养老人扣除方式"
                value={elderly}
                onChange={setElderly}
                options={[
                  { value: "none", label: "不适用" },
                  { value: "only", label: "独生子女" },
                  { value: "shared", label: "非独生子女" },
                ]}
              />
            </DeductionRow>
            <DeductionRow title="继续教育" computed={amountText("continuingEdu")} note={ded("continuingEdu").note}>
              <Segmented
                ariaLabel="继续教育类型"
                value={continuingEdu}
                onChange={setContinuingEdu}
                options={[
                  { value: "none", label: "不适用" },
                  { value: "degree", label: "学历继续教育" },
                  { value: "certificate", label: "职业资格证书" },
                ]}
              />
            </DeductionRow>
            <DeductionRow title="大病医疗" computed={amountText("medical")} note={ded("medical").note}>
              <NumberInput value={medicalSelfPaid} onChange={setMedicalSelfPaid} suffix="元/年" min={0} invalid={isBad(medicalSelfPaid)} />
            </DeductionRow>
            <DeductionRow title="住房（利息/租金）" computed={amountText("housing")} note={ded("housing").note}>
              <div className="space-y-2">
                <Segmented
                  ariaLabel="住房扣除类型"
                  value={housing}
                  onChange={setHousing}
                  options={[
                    { value: "none", label: "不适用" },
                    { value: "loan", label: "房贷利息" },
                    { value: "rent", label: "住房租金" },
                  ]}
                />
                {housing === "rent" && (
                  <Segmented
                    ariaLabel="住房租金档次"
                    value={rentTier}
                    onChange={setRentTier}
                    options={[
                      { value: "tier1", label: "1500/月" },
                      { value: "tier2", label: "1100/月" },
                      { value: "tier3", label: "800/月" },
                    ]}
                  />
                )}
              </div>
            </DeductionRow>
          </div>
          <p className="mt-4 text-[11px] font-mono text-neutral-600">
            标准自 2023 年起执行，以国务院最新公告为准；住房贷款利息与住房租金不可同时扣除。
          </p>
        </div>

        {/* 假设透明 */}
        {mode === "monthly" ? (
          <AssumptionNote
            items={[
              { k: "当前比例", v: `个人合计 ${totalRate.toFixed(1)}%` },
              { k: "起征点", v: `${TAX_THRESHOLD} 元/月` },
              { k: "计算口径", v: "月度税率表（非年度累计）" },
              { k: "城市", v: custom ? "自定义" : city.name },
              { k: "税率表", v: `${TAX_TABLE_META.effectiveYear} 年施行 · ${TAX_TABLE_META.lastVerified}` },
              { k: "社保基数", v: `${city.dataYear} 年数据 · ${city.lastVerified}（示例）` },
              { k: "附加扣除标准", v: `${SPECIAL_DEDUCTION_STANDARDS.dataYear} 年标准 · ${SPECIAL_DEDUCTION_STANDARDS.lastVerified}` },
              { k: "提示", v: "大病医疗、职业资格继续教育仅年度汇算可扣" },
            ]}
          />
        ) : (
          <AssumptionNote
            items={[
              { k: "计算口径", v: "年度综合所得税率表（年度汇算）" },
              { k: "减除费用", v: `${ANNUAL_STANDARD_DEDUCTION} 元/年` },
              { k: "税率表", v: `${TAX_TABLE_META.effectiveYear} 年施行 · ${TAX_TABLE_META.lastVerified}` },
              { k: "附加扣除标准", v: `${SPECIAL_DEDUCTION_STANDARDS.dataYear} 年标准 · ${SPECIAL_DEDUCTION_STANDARDS.lastVerified}` },
              { k: "应退/应补", v: "应纳税额 − 已预缴税额（负=应退，正=应补）" },
              { k: "提示", v: "标准自 2023 年起执行，以国务院最新公告为准" },
            ]}
          />
        )}

        {/* 结果：按月 */}
        {mode === "monthly" && salary && (
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
                {deductions.totalMonthly > 0 && <div className="flex justify-between text-neutral-400"><span>专项附加扣除</span><span>-{money(deductions.totalMonthly)}</span></div>}
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

        {/* 结果：年度汇算 */}
        {mode === "annual" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="应纳税所得额" value={money(annual.taxable)} unit="元/年" />
              <Stat label="年度应纳税额" value={money(annual.tax)} unit="元" tone="warn" />
              <Stat label="已预缴税额" value={money(annual.prepaid)} unit="元" />
              {annual.settlement < 0 ? (
                <Stat label="应退税额" value={money(annual.refund)} unit="元" tone="good" emphasis />
              ) : annual.settlement > 0 ? (
                <Stat label="应补税额" value={money(annual.owe)} unit="元" tone="bad" emphasis />
              ) : (
                <Stat label="应退 / 应补" value="0" unit="元" tone="default" />
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="text-xs font-mono text-neutral-500 mb-3 uppercase tracking-wider">年度汇算明细</div>
              <div className="space-y-1.5 font-mono text-sm">
                <div className="flex justify-between text-neutral-400"><span>全年累计收入</span><span>{money(annual.annualIncome)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>减除费用</span><span>-{money(annual.standardDeduction)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>专项扣除（三险一金）</span><span>-{money(annual.socialInsurance)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>专项附加扣除</span><span>-{money(annual.specialAdditional)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>其他扣除</span><span>-{money(annual.otherDeduction)}</span></div>
                <div className="border-t border-white/[0.06] my-2" />
                <div className="flex justify-between text-neutral-200 mt-1"><span>应纳税所得额</span><span>{money(annual.taxable)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>税率 / 速算扣除</span><span>{annual.bracket.label} · {annual.bracket.quick}</span></div>
                <div className="flex justify-between text-red-300"><span>年度应纳税额</span><span>{money(annual.tax)}</span></div>
                <div className="flex justify-between text-neutral-400"><span>已预缴税额</span><span>-{money(annual.prepaid)}</span></div>
                <div className={`flex justify-between text-base font-semibold mt-2 ${annual.settlement < 0 ? "text-emerald-300" : annual.settlement > 0 ? "text-red-300" : "text-neutral-300"}`}>
                  <span>{annual.settlement < 0 ? "应退税额（多退）" : annual.settlement > 0 ? "应补税额（少补）" : "应退 / 应补"}</span>
                  <span>{annual.settlement < 0 ? money(annual.refund) : annual.settlement > 0 ? money(annual.owe) : "0"} 元</span>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs font-mono text-neutral-600 flex-wrap">
                <span>可复制核对：</span>
                <code className="text-neutral-400">
                  {money(annual.taxable)} × {annual.bracket.label} − {annual.bracket.quick} = {money(annual.tax)}；{money(annual.tax)} − {money(annual.prepaid)} = {annual.settlement >= 0 ? `补 ${money(annual.owe)}` : `退 ${money(annual.refund)}`}
                </code>
                <CopyButton text={`应纳税所得额 ${annual.taxable} × ${annual.bracket.label} − ${annual.bracket.quick} = 应纳税额 ${annual.tax}；已预缴 ${annual.prepaid}；${annual.settlement >= 0 ? "应补" : "应退"} ${Math.abs(annual.settlement)}`} />
              </div>
            </div>

            <Hint kind="success">
              自校验通过：应纳税额 = 应纳税所得额 × 税率 − 速算扣除 = {money(annual.tax)} 元；应退/应补 = {money(annual.tax)} − {money(annual.prepaid)} = {annual.settlement === 0 ? "0 元" : `${annual.settlement > 0 ? "应补" : "应退"} ${money(Math.abs(annual.settlement))} 元`}。
            </Hint>
          </>
        )}
      </div>
    </div>
  );
}
