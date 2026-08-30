"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, Toggle, Field, NumberInput, Stat, Hint } from "@/components/ui";
import { diffDates, addWorkdays, type RangeMode } from "@/lib/date";
import { getHolidaySummary } from "@/lib/holiday";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DateTool() {
  const [tab, setTab] = useState<"diff" | "workday">("diff");
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState(todayISO());
  const [mode, setMode] = useState<RangeMode>("inclusive");
  const [skipHoliday, setSkipHoliday] = useState(false);
  const [holidayYear, setHolidayYear] = useState<"2025" | "2026">("2026");

  const [from, setFrom] = useState(todayISO());
  const [offset, setOffset] = useState("10");

  const holidaySet = useMemo<Set<number>>(
    () => (skipHoliday ? getHolidaySummary(Number(holidayYear))?.offDateSetMs ?? new Set<number>() : new Set<number>()),
    [skipHoliday, holidayYear],
  );

  const diff = useMemo(() => diffDates(start, end, mode, holidaySet), [start, end, mode, holidaySet]);
  const wd = useMemo(() => addWorkdays(from, Number(offset) || 0, holidaySet), [from, offset, holidaySet]);

  return (
    <div>
      <PageHeader badge="日期" title="日期计算" subtitle="天数差 · 工作日 · 日期加减 · 口径明确" tone="blue" />

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
          {/* 口径显式化——修复线上 bug 的核心 */}
          <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div>
              <div className="text-[11px] font-mono text-neutral-500 mb-1.5">区间口径</div>
              <Segmented
                ariaLabel="区间口径"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "inclusive", label: "含首尾" },
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="起始日期">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-4 py-2.5 rounded-xl font-mono text-sm" />
            </Field>
            <Field label="结束日期">
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-4 py-2.5 rounded-xl font-mono text-sm" />
            </Field>
          </div>

          {!diff.ok ? (
            <Hint kind="error">{diff.error}</Hint>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat label="总天数" value={diff.totalDays} unit="天" emphasis />
                <Stat label="工作日" value={diff.workdays} unit="天" tone="accent" />
                <Stat label="周末/休息" value={diff.weekendDays} unit="天" tone="warn" />
              </div>
              <Hint kind="success">
                口径为「{mode === "inclusive" ? "含首尾两天" : "不含结束日"}」，恒满足 总天数 {diff.totalDays} = 工作日 {diff.workdays} + 休息 {diff.weekendDays}。
                起始日属第 {diff.startWeek.week} 周（{diff.startWeek.from} ~ {diff.startWeek.to}）。
              </Hint>
            </>
          )}
        </div>
      )}

      {tab === "workday" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="起始日期">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-4 py-2.5 rounded-xl font-mono text-sm" />
            </Field>
            <Field label="加减工作日" hint="负数表示向前">
              <NumberInput value={offset} onChange={setOffset} suffix="工作日" />
            </Field>
          </div>
          <div>
            <div className="text-[11px] font-mono text-neutral-500 mb-1.5">工作日跳过法定节假日</div>
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

          {!wd.ok ? (
            <Hint kind="error">{wd.error}</Hint>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Stat label="结果日期" value={wd.result} emphasis tone="good" />
              <Stat
                label="方向"
                value={wd.direction === "forward" ? "向后" : wd.direction === "backward" ? "向前" : "原地"}
                unit={wd.direction === "none" ? "" : `(${Math.abs(Number(offset))} 工作日)`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
