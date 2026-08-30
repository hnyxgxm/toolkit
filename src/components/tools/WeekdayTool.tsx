"use client";

import { useMemo, useState } from "react";
import { PageHeader, Field, Stat, Hint } from "@/components/ui";
import { weekdayCN, isoWeek, parseISO } from "@/lib/date";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WeekdayTool() {
  const [date, setDate] = useState(todayISO());
  const info = useMemo(() => {
    const ms = parseISO(date);
    if (ms === null) return null;
    const w = isoWeek(ms);
    const isWknd = (() => {
      const d = new Date(ms).getUTCDay();
      return d === 0 || d === 6;
    })();
    return { cn: weekdayCN(date)!, week: w, isWknd };
  }, [date]);

  return (
    <div>
      <PageHeader badge="日期" title="日期查星期" subtitle="任意公历日期 → 星期几 · 含 ISO 周数" tone="blue" />

      <div className="max-w-sm mb-6">
        <Field label="选择日期">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl font-mono text-sm" />
        </Field>
      </div>

      {!info ? (
        <Hint kind="error">请输入有效日期</Hint>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Stat label={date} value={info.cn} emphasis tone={info.isWknd ? "warn" : "accent"} />
            <Stat label="星期(数字)" value={info.isWknd ? "周末" : "工作日"} />
            <Stat label="ISO 周数" value={`第 ${info.week.week} 周`} />
          </div>
          <Hint kind="info">所在周区间：{info.week.from} ~ {info.week.to}</Hint>
        </>
      )}
    </div>
  );
}
