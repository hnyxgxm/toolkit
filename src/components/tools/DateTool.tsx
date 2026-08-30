"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Segmented, Toggle, Field, NumberInput, Stat, Hint, CopyButton } from "@/components/ui";
import { diffDates, diffUnits, formatDurationCN, formatWeeksCN, shiftISO, addWorkdays, type RangeMode } from "@/lib/date";
import { getHolidaySummary } from "@/lib/holiday";

const INPUT = "w-full px-4 py-2.5 rounded-xl font-mono text-sm";

/** 客户端专用（仅在 effect/事件回调中调用，不影响 hydration） */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 日期输入 + 「今天」快捷 */
function DateField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
        <button
          type="button"
          onClick={() => onChange(todayISO())}
          className="flex-shrink-0 text-xs font-mono px-3 rounded-xl border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          今天
        </button>
      </div>
    </Field>
  );
}

export default function DateTool() {
  const [tab, setTab] = useState<"diff" | "workday">("diff");
  // 初始留空保证 SSR 首帧确定性，挂载后填入演示区间（近 30 天）
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<RangeMode>("inclusive"); // 默认含尾日，对齐 timeanddate
  const [skipHoliday, setSkipHoliday] = useState(false);
  const [holidayYear, setHolidayYear] = useState<"2025" | "2026">("2026");

  const [from, setFrom] = useState("");
  const [offset, setOffset] = useState("10");

  useEffect(() => {
    const t = todayISO();
    setStart(shiftISO(t, -30) ?? t);
    setEnd(t);
    setFrom(t);
  }, []);

  const holidaySet = useMemo<Set<number>>(
    () => (skipHoliday ? getHolidaySummary(Number(holidayYear))?.offDateSetMs ?? new Set<number>() : new Set<number>()),
    [skipHoliday, holidayYear],
  );

  const ready = start !== "" && end !== "";
  const diff = useMemo(() => (ready ? diffDates(start, end, mode, holidaySet) : null), [ready, start, end, mode, holidaySet]);
  const units = useMemo(() => (ready ? diffUnits(start, end, mode) : null), [ready, start, end, mode]);

  const wdReady = from !== "";
  const wd = useMemo(() => (wdReady ? addWorkdays(from, Number(offset) || 0, holidaySet) : null), [wdReady, from, offset, holidaySet]);

  return (
    <div>
      <PageHeader badge="日期" title="日期计算" subtitle="天数差 · 天/周/月/年多单位 · 工作日统计 · 口径明确" tone="blue" />

      <div className="mb-6">
        <Segmented
          ariaLabel="计算模式"
          value={tab}
          onChange={setTab}
          options={[
            { value: "diff", label: "日期差值" },
            { value: "workday", label: "工作日加减" },
          ]}
        />
      </div>

      {tab === "diff" && (
        <div className="space-y-6">
          {/* ① 区间口径显式化：默认「含尾日」 */}
          <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div>
              <div className="text-[11px] font-mono text-neutral-500 mb-1.5">区间口径</div>
              <Segmented
                ariaLabel="区间口径"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "inclusive", label: "含尾日" },
                  { value: "exclusive", label: "不含结束日" },
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-mono text-neutral-500 mb-1.5">工作日跳过</div>
              <div className="flex items-center gap-3">
                <Toggle checked={skipHoliday} onChange={setSkipHoliday} label="法定节假日" />
                {skipHoliday && (
                  <Segmented
                    ariaLabel="节假日年份"
                    value={holidayYear}
                    onChange={setHolidayYear}
                    options={[
                      { value: "2025", label: "2025" },
                      { value: "2026", label: "2026" },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ④ 双 date 选择器 + 今天快捷 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <DateField label="起始日期" value={start} onChange={setStart} />
            <DateField label="结束日期" value={end} onChange={setEnd} />
          </div>

          {!ready ? (
            <Hint kind="info">选择起始与结束日期后自动计算，也可点击「今天」快捷填入</Hint>
          ) : !diff?.ok ? (
            <Hint kind="error">{diff?.error ?? "请输入有效的起始与结束日期"}</Hint>
          ) : !units ? (
            <Hint kind="error">无法拆解该区间，请检查日期</Hint>
          ) : (
            <>
              {/* ② 天/周/月/年多单位 + ③ 工作日/休息日统计 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Stat label={`总天数（${mode === "inclusive" ? "含尾日" : "不含结束日"}）`} value={units.totalDays} unit="天" emphasis />
                <Stat label="按周" value={formatWeeksCN(units)} />
                <Stat label="按年·月·日" value={formatDurationCN(units)} />
                <Stat label="工作日" value={diff.workdays} unit="天" tone="accent" />
                <Stat label="休息日" value={diff.weekendDays} unit="天" tone="warn" />
              </div>

              {/* ⑤ 口径解释：消除歧义 */}
              <Hint kind="success">
                口径：「{mode === "inclusive" ? "含尾日（Include end day）——起始日与结束日均计入" : "不含结束日——结束日当天不计入"}」；
                工作日 = 周一至周五{skipHoliday ? `，法定节假日（${holidayYear}）视为休息` : ""}，休息日 = 周六/周日
                {skipHoliday ? " 及节假日" : ""}。恒满足：总天数 {units.totalDays} = 工作日 {diff.workdays} + 休息日 {diff.weekendDays}；
                年/月按日历拆解，不足一月按天计。
              </Hint>
              <div className="flex gap-2">
                <CopyButton
                  text={`${start} ~ ${end}：共 ${units.totalDays} 天（${formatWeeksCN(units)}；${formatDurationCN(units)}），工作日 ${diff.workdays} 天，休息日 ${diff.weekendDays} 天`}
                  label="复制结果摘要"
                />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "workday" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <DateField label="起始日期" value={from} onChange={setFrom} />
            <Field label="加减工作日" hint="负数表示向前">
              <NumberInput value={offset} onChange={setOffset} suffix="工作日" />
            </Field>
          </div>
          <div>
            <div className="text-[11px] font-mono text-neutral-500 mb-1.5">工作日跳过法定节假日（工作日口径：周一至周五）</div>
            <div className="flex items-center gap-3">
              <Toggle checked={skipHoliday} onChange={setSkipHoliday} label="法定节假日" />
              {skipHoliday && (
                <Segmented
                  ariaLabel="节假日年份"
                  value={holidayYear}
                  onChange={setHolidayYear}
                  options={[
                    { value: "2025", label: "2025" },
                    { value: "2026", label: "2026" },
                  ]}
                />
              )}
            </div>
          </div>

          {!wdReady ? (
            <Hint kind="info">选择起始日期并输入工作日数后自动计算</Hint>
          ) : !wd?.ok ? (
            <Hint kind="error">{wd?.error ?? "请输入有效日期"}</Hint>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Stat label="结果日期" value={wd.result} emphasis tone="good" />
              <Stat
                label="方向"
                value={wd.direction === "forward" ? "向后" : wd.direction === "backward" ? "向前" : "原地"}
                unit={wd.direction === "none" ? "" : `(${Math.abs(Number(offset)) || 0} 工作日)`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
