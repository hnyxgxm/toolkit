"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PageHeader, Segmented, Toggle, Field, NumberInput, Stat, Hint, AssumptionNote, CopyButton } from "@/components/ui";
import {
  calcTax,
  calcAnnualTax,
  calcSpecialDeductions,
  calcGrossFromTakeHome,
  findBracketIndex,
  bracketRangeLabel,
  CITY_PRESETS,
  MONTHLY_BRACKETS,
  ANNUAL_BRACKETS,
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
const CUSTOM_CITY = "custom";

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

/* ==================== 视觉零件（仅本工具使用） ==================== */

/** 输入区 / 结果区分区标题 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2" aria-hidden>
      <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-600">{children}</span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

/** 卡片容器 */
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 ${className}`}>{children}</div>;
}

/** 卡片标题行 */
function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">{children}</span>
      {right}
    </div>
  );
}

/** 明细行：左标签、右金额，等宽数字右对齐 */
function MoneyRow({ label, value, tone, strong }: { label: ReactNode; value: ReactNode; tone?: "dim" | "bad" | "good"; strong?: boolean }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : tone === "dim" ? "text-neutral-500" : "text-neutral-300";
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={`text-sm ${strong ? "text-neutral-200 font-semibold" : "text-neutral-400"}`}>{label}</span>
      <span className={`font-mono tabular-nums text-right ${strong ? "text-base font-semibold" : "text-sm"} ${color}`}>{value}</span>
    </div>
  );
}

/** 口径说明：切换计税方式时显式标注所用工式 */
function FormulaCard({ mode }: { mode: Mode }) {
  const monthly = mode === "monthly";
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-500/30 text-blue-300">所用工式</span>
        <span className="text-xs font-mono text-blue-300">
          {monthly ? "累计预扣法（本工具为按月简化估算）" : "年度汇算清缴（综合所得税率表）"}
        </span>
      </div>
      <p className="text-[11px] font-mono text-neutral-400 leading-relaxed">
        {monthly
          ? "实务中工资薪金按「累计预扣法」预缴：累计应纳税所得额 = 累计收入 − 累计减除费用（5,000 × 月份数）− 累计专项扣除 − 累计专项附加扣除；本期应预扣税额 = 累计应纳税所得额 × 预扣率 − 速算扣除数 − 累计已预扣税额。本工具按「单月应纳税所得额 × 月度税率表」简化估算（与年初月份一致），随累计金额升高，实际预扣可能高于估算值，最终以年度汇算为准。"
          : "年度汇算清缴：应纳税额 =（全年收入 − 60,000 减除费用 − 专项扣除 − 专项附加扣除 − 其他扣除）× 适用税率 − 速算扣除数；应退 / 应补 = 应纳税额 − 已预缴税额。办理期为次年 3 月 1 日至 6 月 30 日，多退少补。"}
      </p>
    </div>
  );
}

/** 七级超额累进税率表（固定展示，高亮当前适用档） */
function BracketTable({ title, rangeHeader, brackets, taxable }: { title: string; rangeHeader: string; brackets: Array<[number, number, number]>; taxable: number }) {
  const idx = findBracketIndex(taxable, brackets);
  const hasTaxable = taxable > 0;
  return (
    <Card>
      <CardTitle right={<span className="text-[11px] font-mono text-neutral-600">{TAX_TABLE_META.effectiveYear} 年施行 · {TAX_TABLE_META.lastVerified}</span>}>
        {title}
      </CardTitle>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-neutral-600">
            <th className="py-1.5 pr-2 text-left font-normal">级数</th>
            <th className="py-1.5 px-2 text-left font-normal">{rangeHeader}</th>
            <th className="py-1.5 px-2 text-right font-normal">税率</th>
            <th className="py-1.5 pl-2 text-right font-normal">速算扣除数</th>
          </tr>
        </thead>
        <tbody>
          {brackets.map((b, i) => {
            const on = hasTaxable && i === idx;
            return (
              <tr key={i} className={`border-t border-white/[0.04] ${on ? "bg-emerald-500/[0.08]" : ""}`}>
                <td className={`py-1.5 pr-2 whitespace-nowrap ${on ? "text-emerald-300" : "text-neutral-500"}`}>
                  {i + 1}
                  {on && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">当前适用</span>}
                </td>
                <td className={`py-1.5 px-2 ${on ? "text-emerald-300" : "text-neutral-400"}`}>{bracketRangeLabel(brackets, i)}</td>
                <td className={`py-1.5 px-2 text-right tabular-nums ${on ? "text-emerald-300 font-semibold" : "text-neutral-300"}`}>{(b[1] * 100).toFixed(0)}%</td>
                <td className={`py-1.5 pl-2 text-right tabular-nums ${on ? "text-emerald-300" : "text-neutral-400"}`}>{money(b[2])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!hasTaxable && <p className="mt-2 text-[11px] font-mono text-neutral-600">当前应纳税所得额 ≤ 0，无需缴税，不适用任何税率档。</p>}
    </Card>
  );
}

/** 专项附加扣除分类条目（标题 + 当口径金额 + 控件 + 口径说明） */
function DeductionRow({ title, computed, note, children }: { title: string; computed: string; note: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-neutral-300">{title}</span>
        <span className="text-xs font-mono tabular-nums text-neutral-400">{computed}</span>
      </div>
      {children}
      <p className="mt-1 text-[11px] font-mono text-neutral-600">{note}</p>
    </div>
  );
}

export default function TaxTool() {
  const [mode, setMode] = useState<Mode>("monthly");

  // —— 参保城市（select 驱动：预设城市自动带入基数上下限与默认比例，另含"自定义"项）——
  const [cityId, setCityId] = useState<string>(CITY_PRESETS[0].id);
  const [rates, setRates] = useState<Rates>(CITY_PRESETS[0].rates);
  const [baseFloor, setBaseFloor] = useState<number>(CITY_PRESETS[0].baseFloor);
  const [baseCap, setBaseCap] = useState<number>(CITY_PRESETS[0].baseCap);
  const isCustom = cityId === CUSTOM_CITY;
  const city = isCustom ? null : CITY_PRESETS.find((c) => c.id === cityId) ?? null;

  const pickCity = (id: string) => {
    setCityId(id);
    if (id === CUSTOM_CITY) return; // 保留当前比例与基数，供用户自行修改
    const c = CITY_PRESETS.find((x) => x.id === id);
    if (c) {
      setRates(c.rates);
      setBaseFloor(c.baseFloor);
      setBaseCap(c.baseCap);
    }
  };

  // —— 按月模式 ——
  const [salary, setSalary] = useState("25000");
  const [applyBase, setApplyBase] = useState(false);
  const [targetTakeHome, setTargetTakeHome] = useState("");

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
        baseFloor,
        baseCap,
      }),
    [salary, rates, applyBase, baseFloor, baseCap, deductions],
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

  // 税后反推税前（仅按月模式；目标 > 0 且合法时启用）
  const reverse = useMemo(() => {
    if (mode !== "monthly" || isBad(targetTakeHome)) return null;
    const t = num(targetTakeHome);
    if (!(t > 0)) return null;
    return calcGrossFromTakeHome(t, {
      rates,
      specialAdditional: deductions.totalMonthly,
      applyBaseLimit: applyBase,
      baseFloor,
      baseCap,
    });
  }, [mode, targetTakeHome, rates, applyBase, baseFloor, baseCap, deductions]);

  const totalRate = rates.pension + rates.medical + rates.unemployment + rates.housing;

  // 非法输入（负数/非法字符）检测：非法项按 0 参与计算，绝不出 NaN
  const badInputs = [salary, childrenCount, infantCount, medicalSelfPaid, annualIncome, prepaidTax, annualSocial, annualOther, targetTakeHome].filter(isBad);
  const hasBad = badInputs.length > 0;

  return (
    <div>
      <PageHeader badge="生活" title="个税计算器" subtitle="五险一金 · 个税 · 到手工资 · 税前税后互推 · 年度汇算（口径透明）" tone="emerald" />

      <div className="space-y-6">
        {/* 0 计税方式 + 工式标注 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
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
              {mode === "monthly" ? "月度税率表 · 单月简化" : "年度综合所得税率表 · 应退/应补"}
            </span>
          </div>
          <FormulaCard mode={mode} />
        </div>

        {hasBad && (
          <Hint kind="error">输入有误：金额与数量不能为负数或非法字符，请修正标红输入框（非法项已按 0 参与计算，不会出现 NaN）。</Hint>
        )}

        {/* ==================== 输入区 ==================== */}
        <SectionLabel>输入 · {mode === "monthly" ? "按月估算" : "年度汇算"}</SectionLabel>

        {/* 1 参保城市（仅按月模式）：select 自动带入基数上下限与默认比例 */}
        {mode === "monthly" && (
          <Card>
            <CardTitle>① 参保城市（选择自动带入参数，比例与基数均可手动修改）</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <select
                aria-label="参保城市"
                value={cityId}
                onChange={(e) => pickCity(e.target.value)}
                className="w-full sm:w-auto min-w-56 px-4 py-3 rounded-xl font-mono text-[15px] bg-white/[0.03] border border-white/[0.06] text-neutral-200 cursor-pointer focus:border-blue-500 focus:outline-none"
              >
                {CITY_PRESETS.map((c) => (
                  <option key={c.id} value={c.id} className="bg-neutral-900 text-neutral-200">
                    {c.name} · 个人合计 {(c.rates.pension + c.rates.medical + c.rates.unemployment + c.rates.housing).toFixed(1)}%
                  </option>
                ))}
                <option value={CUSTOM_CITY} className="bg-neutral-900 text-neutral-200">
                  自定义比例 / 基数
                </option>
              </select>
              <span className="text-[11px] font-mono text-neutral-600">
                缴费基数 {money(baseFloor)} ~ {money(baseCap)} 元/月
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3 mt-4">
              {(["pension", "medical", "unemployment", "housing"] as const).map((k) => (
                <Field key={k} label={{ pension: "养老%", medical: "医疗%", unemployment: "失业%", housing: "公积金%" }[k]}>
                  <NumberInput value={rates[k]} onChange={(v) => setRates({ ...rates, [k]: Math.max(0, Number(v) || 0) })} suffix="%" />
                </Field>
              ))}
              <Field label="基数下限" hint="元/月">
                <NumberInput value={baseFloor} onChange={(v) => setBaseFloor(Math.max(0, Number(v) || 0))} suffix="元" />
              </Field>
              <Field label="基数上限" hint="元/月">
                <NumberInput value={baseCap} onChange={(v) => setBaseCap(Math.max(0, Number(v) || 0))} suffix="元" />
              </Field>
            </div>
            <p className="mt-2 text-[11px] font-mono text-neutral-600">
              比例与基数改完即时重算。公积金各地政策区间一般为 5%–12%，公司实际缴存比例以工资单为准；基数下限对应「按最低基数缴纳」。
            </p>

            {/* 五险一金逐项明细（含比例与基数上下限，金额按当前税前月薪估算） */}
            <div className="mt-4 pt-3 border-t border-white/[0.04] overflow-x-auto">
              <table className="w-full text-xs font-mono min-w-100">
                <thead>
                  <tr className="text-neutral-600">
                    <th className="py-1.5 pr-3 text-left font-normal">险种（个人）</th>
                    <th className="py-1.5 px-2 text-right font-normal">比例</th>
                    <th className="py-1.5 px-2 text-right font-normal">基数下限</th>
                    <th className="py-1.5 px-2 text-right font-normal">基数上限</th>
                    <th className="py-1.5 pl-2 text-right font-normal">个人缴费/月</th>
                  </tr>
                </thead>
                <tbody>
                  {result.breakdown.map((b) => (
                    <tr key={b.key} className="border-t border-white/[0.04] text-neutral-300">
                      <td className="py-1.5 pr-3 text-left">{b.label}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{b.rate}%</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{money(baseFloor)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{money(baseCap)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">-{money(b.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/[0.08] text-neutral-200">
                    <td className="py-1.5 pr-3 text-left" colSpan={4}>
                      合计（{totalRate.toFixed(1)}%）
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">-{money(result.insuranceTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] font-mono text-neutral-600">
                {isCustom
                  ? "自定义数据 · 请以参保地口径为准；工伤 / 生育由单位缴纳，个人不缴费。"
                  : `示例数据，${city!.dataYear} 年口径 · ${city!.lastVerified}，以参保地口径为准；工伤 / 生育由单位缴纳，个人不缴费。`}
              </p>
            </div>
          </Card>
        )}

        {/* 2 收入输入 */}
        {mode === "monthly" ? (
          <Card>
            <CardTitle>② 税前月薪</CardTitle>
            <Field label="税前月薪" hint="元/月">
              <NumberInput value={salary} onChange={setSalary} suffix="元" invalid={isBad(salary)} />
            </Field>
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK.map((q) => (
                <button key={q} onClick={() => setSalary(String(q))} className="px-2.5 py-1 rounded-md text-xs font-mono text-neutral-400 border border-white/[0.06] hover:border-white/20 hover:text-white transition-all">
                  {q / 10000}万
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <CardTitle>② 全年收入与预缴</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="全年累计收入" hint="并入综合所得的全部收入，元/年">
                <NumberInput value={annualIncome} onChange={setAnnualIncome} suffix="元" invalid={isBad(annualIncome)} />
              </Field>
              <Field label="已预缴税额" hint="全年已预扣预缴个税合计，元">
                <NumberInput value={prepaidTax} onChange={setPrepaidTax} suffix="元" invalid={isBad(prepaidTax)} />
              </Field>
              <Field label="专项扣除（三险一金）" hint="个人承担部分全年合计，元/年">
                <NumberInput value={annualSocial} onChange={setAnnualSocial} suffix="元" invalid={isBad(annualSocial)} />
              </Field>
              <Field label="其他扣除" hint="年金、商业健康险等，元/年">
                <NumberInput value={annualOther} onChange={setAnnualOther} suffix="元" invalid={isBad(annualOther)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK_ANNUAL.map((q) => (
                <button key={q} onClick={() => setAnnualIncome(String(q))} className="px-2.5 py-1 rounded-md text-xs font-mono text-neutral-400 border border-white/[0.06] hover:border-white/20 hover:text-white transition-all">
                  {q / 10000}万
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* 3 社保基数上下限（仅按月模式） */}
        {mode === "monthly" && (
          <Card>
            <Toggle checked={applyBase} onChange={setApplyBase} label="③ 按社保缴费基数上下限调整" hint={`下限 ${money(baseFloor)} / 上限 ${money(baseCap)}`} />
            <p className="mt-2 text-[11px] font-mono text-neutral-600">
              关闭时五险一金按全额工资计（便于快速估算）；开启后缴费基数会在 {money(baseFloor)}~{money(baseCap)} 间封顶保底，更接近真实工资条。
            </p>
          </Card>
        )}

        {/* 4 税后反推税前（仅按月模式） */}
        {mode === "monthly" && (
          <Card>
            <CardTitle right={<span className="text-[11px] font-mono text-neutral-600">与正向计算同一套五险一金 + 税率表口径</span>}>④ 税后反推税前</CardTitle>
            <Field label="目标税后到手" hint="元/月">
              <NumberInput value={targetTakeHome} onChange={setTargetTakeHome} suffix="元" placeholder="如 15000" invalid={isBad(targetTakeHome)} />
            </Field>
            {reverse && !reverse.converged && (
              <div className="mt-3">
                <Hint kind="warn">当前比例下该目标税后不可达（五险一金 + 个税边际比例异常），请检查比例与基数设置。</Hint>
              </div>
            )}
            {reverse && reverse.converged && (
              <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                <MoneyRow label="需税前月薪" value={<span className="text-emerald-300">{money(reverse.gross)} 元</span>} strong />
                <MoneyRow label="五险一金（个人）" value={`-${money(reverse.insuranceTotal)}`} />
                <MoneyRow label="应缴个税" value={`-${money(reverse.tax)}`} />
                <MoneyRow label="税后到手（反算校验）" value={`${money(reverse.takeHome)} 元 · 误差 ${money(reverse.residual)} 元`} tone="dim" />
                <div className="pt-2">
                  <button
                    onClick={() => setSalary(String(reverse.gross))}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white text-black hover:bg-neutral-200 transition-all"
                  >
                    填入税前月薪 →
                  </button>
                </div>
              </div>
            )}
            {!reverse && <p className="mt-2 text-[11px] font-mono text-neutral-600">输入目标税后，自动反推所需税前月薪（二分精确求解，误差 &lt; 0.01 元）。</p>}
          </Card>
        )}

        {/* 专项附加扣除分类（两种模式共用） */}
        <Card>
          <CardTitle
            right={
              <span className="text-xs font-mono tabular-nums text-neutral-400">
                {mode === "monthly" ? `按月可扣合计 -${money(deductions.totalMonthly)} 元/月` : `全年可扣合计 -${money(deductions.totalAnnual)} 元/年`}
              </span>
            }
          >
            专项附加扣除 · 分类录入
          </CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-x-6 gap-y-5">
            <DeductionRow title="子女教育" computed={amountText("childrenEducation")} note={ded("childrenEducation").note}>
              <NumberInput value={childrenCount} onChange={setChildrenCount} suffix="孩" invalid={isBad(childrenCount)} />
            </DeductionRow>
            <DeductionRow title="3岁以下婴幼儿照护" computed={amountText("infantCare")} note={ded("infantCare").note}>
              <NumberInput value={infantCount} onChange={setInfantCount} suffix="孩" invalid={isBad(infantCount)} />
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
              <NumberInput value={medicalSelfPaid} onChange={setMedicalSelfPaid} suffix="元/年" invalid={isBad(medicalSelfPaid)} />
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
        </Card>

        {/* 假设透明 */}
        {mode === "monthly" ? (
          <AssumptionNote
            items={[
              { k: "所用工式", v: "单月应纳税所得额 × 月度税率表（累计预扣法见上方口径说明）" },
              { k: "当前比例", v: `个人合计 ${totalRate.toFixed(1)}%` },
              { k: "起征点", v: `${TAX_THRESHOLD} 元/月` },
              { k: "参保城市", v: isCustom ? "自定义" : city!.name },
              { k: "社保基数", v: `${money(baseFloor)} ~ ${money(baseCap)} 元/月` },
              { k: "税率表", v: `${TAX_TABLE_META.effectiveYear} 年施行 · ${TAX_TABLE_META.lastVerified}` },
              { k: "城市数据", v: isCustom ? "自定义数据，以参保地口径为准" : `${city!.dataYear} 年数据 · ${city!.lastVerified}（示例）` },
              { k: "附加扣除标准", v: `${SPECIAL_DEDUCTION_STANDARDS.dataYear} 年标准 · ${SPECIAL_DEDUCTION_STANDARDS.lastVerified}` },
              { k: "提示", v: "大病医疗、职业资格继续教育仅年度汇算可扣" },
            ]}
          />
        ) : (
          <AssumptionNote
            items={[
              { k: "所用工式", v: "年度综合所得税率表（汇算清缴，见上方口径说明）" },
              { k: "减除费用", v: `${ANNUAL_STANDARD_DEDUCTION} 元/年` },
              { k: "税率表", v: `${TAX_TABLE_META.effectiveYear} 年施行 · ${TAX_TABLE_META.lastVerified}` },
              { k: "附加扣除标准", v: `${SPECIAL_DEDUCTION_STANDARDS.dataYear} 年标准 · ${SPECIAL_DEDUCTION_STANDARDS.lastVerified}` },
              { k: "应退/应补", v: "应纳税额 − 已预缴税额（负=应退，正=应补）" },
              { k: "提示", v: "标准自 2023 年起执行，以国务院最新公告为准" },
            ]}
          />
        )}

        {/* ==================== 结果区 ==================== */}
        {mode === "monthly" && salary && (
          <>
            <SectionLabel>计算结果 · 按月估算</SectionLabel>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="五险一金(个人)" value={`-${money(result.insuranceTotal)}`} tone="warn" />
              <Stat label="应纳税所得额" value={money(result.taxable)} />
              <Stat label="应缴个税" value={money(result.tax)} tone="bad" />
              <Stat label="税后到手" value={money(result.takeHome)} emphasis tone="good" />
            </div>

            <Card>
              <CardTitle>计算明细</CardTitle>
              <div className="space-y-1.5">
                {result.breakdown.map((b) => (
                  <MoneyRow key={b.key} label={`${b.label} ${b.rate}%`} value={`-${money(b.amount)}`} />
                ))}
                <div className="border-t border-white/[0.06] my-2" />
                <MoneyRow label="五险一金合计" value={`-${money(result.insuranceTotal)}`} />
                <MoneyRow label="起征点" value={`-${money(TAX_THRESHOLD)}`} />
                {deductions.totalMonthly > 0 && <MoneyRow label="专项附加扣除" value={`-${money(deductions.totalMonthly)}`} />}
                <MoneyRow label="应纳税所得额" value={money(result.taxable)} strong />
                <MoneyRow label="税率 / 速算扣除" value={`${result.bracket.label} · ${money(result.bracket.quick)}`} />
                <MoneyRow label="应缴个税" value={money(result.tax)} tone="bad" />
                <div className="border-t border-white/[0.06] my-2" />
                <MoneyRow label="税后到手" value={`${money(result.takeHome)} 元/月`} tone="good" strong />
                <MoneyRow label="年到手" value={money(result.yearTakeHome)} tone="dim" />
                <MoneyRow label="公积金个人账户入账（含单位）" value={money(result.housingFundPersonal * 2)} tone="dim" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs font-mono text-neutral-600 flex-wrap">
                <span>可复制核对：</span>
                <code className="text-neutral-400">
                  {salary} − {money(result.insuranceTotal)} − {money(result.tax)} = {money(result.takeHome)}
                </code>
                <CopyButton text={`${salary} − ${result.insuranceTotal} − ${result.tax} = ${result.takeHome}`} />
              </div>
            </Card>

            <BracketTable
              title="七级超额累进税率表 · 按月（简化估算口径）"
              rangeHeader="全月应纳税所得额"
              brackets={MONTHLY_BRACKETS}
              taxable={result.taxable}
            />

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
            <SectionLabel>计算结果 · 年度汇算</SectionLabel>

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

            <Card>
              <CardTitle>年度汇算明细</CardTitle>
              <div className="space-y-1.5">
                <MoneyRow label="全年累计收入" value={money(annual.annualIncome)} />
                <MoneyRow label="减除费用" value={`-${money(annual.standardDeduction)}`} />
                <MoneyRow label="专项扣除（三险一金）" value={`-${money(annual.socialInsurance)}`} />
                <MoneyRow label="专项附加扣除" value={`-${money(annual.specialAdditional)}`} />
                <MoneyRow label="其他扣除" value={`-${money(annual.otherDeduction)}`} />
                <div className="border-t border-white/[0.06] my-2" />
                <MoneyRow label="应纳税所得额" value={money(annual.taxable)} strong />
                <MoneyRow label="税率 / 速算扣除" value={`${annual.bracket.label} · ${money(annual.bracket.quick)}`} />
                <MoneyRow label="年度应纳税额" value={money(annual.tax)} tone="bad" />
                <MoneyRow label="已预缴税额" value={`-${money(annual.prepaid)}`} />
                <div className="border-t border-white/[0.06] my-2" />
                <MoneyRow
                  label={annual.settlement < 0 ? "应退税额（多退）" : annual.settlement > 0 ? "应补税额（少补）" : "应退 / 应补"}
                  value={`${annual.settlement < 0 ? money(annual.refund) : annual.settlement > 0 ? money(annual.owe) : "0"} 元`}
                  tone={annual.settlement < 0 ? "good" : annual.settlement > 0 ? "bad" : "dim"}
                  strong
                />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs font-mono text-neutral-600 flex-wrap">
                <span>可复制核对：</span>
                <code className="text-neutral-400">
                  {money(annual.taxable)} × {annual.bracket.label} − {annual.bracket.quick} = {money(annual.tax)}；{money(annual.tax)} − {money(annual.prepaid)} = {annual.settlement >= 0 ? `补 ${money(annual.owe)}` : `退 ${money(annual.refund)}`}
                </code>
                <CopyButton text={`应纳税所得额 ${annual.taxable} × ${annual.bracket.label} − ${annual.bracket.quick} = 应纳税额 ${annual.tax}；已预缴 ${annual.prepaid}；${annual.settlement >= 0 ? "应补" : "应退"} ${Math.abs(annual.settlement)}`} />
              </div>
            </Card>

            <BracketTable
              title="七级超额累进税率表 · 综合所得（年度）"
              rangeHeader="全年应纳税所得额"
              brackets={ANNUAL_BRACKETS}
              taxable={annual.taxable}
            />

            <Hint kind="success">
              自校验通过：应纳税额 = 应纳税所得额 × 税率 − 速算扣除 = {money(annual.tax)} 元；应退/应补 = {money(annual.tax)} − {money(annual.prepaid)} = {annual.settlement === 0 ? "0 元" : `${annual.settlement > 0 ? "应补" : "应退"} ${money(Math.abs(annual.settlement))} 元`}。
            </Hint>
          </>
        )}
      </div>
    </div>
  );
}
