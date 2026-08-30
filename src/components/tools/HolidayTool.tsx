"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, Stat, Hint, AssumptionNote } from "@/components/ui";
import { getHolidaySummary, AVAILABLE_YEARS, STATUTORY_HOLIDAY_DAYS } from "@/lib/holiday";

export default function HolidayTool() {
  const [year, setYear] = useState<"2025" | "2026" | "2027">("2026");
  const summary = useMemo(() => getHolidaySummary(Number(year)), [year]);

  return (
    <div>
      <PageHeader badge="日期" title="法定节假日" subtitle="放假 / 补班安排 · 明确标注数据来源" tone="blue" />

      <div className="mb-6">
        <Segmented
          ariaLabel="年份"
          value={year}
          onChange={setYear}
          options={AVAILABLE_YEARS.map((y) => ({ value: String(y) as "2025" | "2026" | "2027", label: `${y}${y <= 2026 ? "" : " ·未公布"}` }))}
        />
      </div>

      {!summary ? null : !summary.official ? (
        <div className="space-y-4">
          <Hint kind="warn">
            {year} 年放假安排<span className="text-amber-200">官方尚未发布</span>（国务院通常在上年 11–12 月公布）。
            为避免误导，这里<span className="text-amber-200">只列出确定的法定事实</span>，不编造具体调休日期。
          </Hint>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Stat label="法定节假日天数" value={STATUTORY_HOLIDAY_DAYS} unit="天" emphasis />
            <Stat label="数据来源" value="待定" tone="warn" />
          </div>
          <AssumptionNote
            items={[
              { k: "确定事实", v: "全体公民放假节日共 11 天" },
              { k: "依据", v: "《全国年节及纪念日放假办法》" },
              { k: "连休天数", v: "取决于届时调休安排" },
            ]}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label={`${year} 全年放假`} value={summary.totalOffDays} unit="天" emphasis tone="good" />
            <Stat label="补班(周末上班)" value={summary.totalMakeupDays} unit="天" tone="warn" />
            <Stat label="数据来源" value="国务院办公厅通知" tone="accent" />
          </div>

          <Hint kind="success">✅ 本表与官方通知一致：{summary.source}</Hint>

          <div className="space-y-3">
            {summary.festivals.map((f) => (
              <div key={f.name} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold">{f.name}</span>
                  <span className="text-xs font-mono text-neutral-500">
                    {f.from === f.to ? f.from : `${f.from} ~ ${f.to}`} · {f.offDays} 天
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {f.offDates.map((d) => (
                    <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-400 border border-emerald-500/20 bg-emerald-500/5">
                      {d.slice(5)} 休
                    </span>
                  ))}
                  {f.makeup.map((d) => (
                    <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400 border border-amber-500/20 bg-amber-500/5">
                      {d.slice(5)} 班
                    </span>
                  ))}
                </div>
                {f.makeup.length > 0 && (
                  <div className="text-[11px] font-mono text-neutral-600">需补班：{f.makeup.join("、")}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
