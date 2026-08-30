"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Segmented, Stat, Hint, AssumptionNote } from "@/components/ui";
import {
  getHolidaySummary,
  AVAILABLE_YEARS,
  STATUTORY_HOLIDAY_DAYS,
  HOLIDAY_DATA_LAST_VERIFIED,
  buildYearGrids,
  buildYearIcs,
  findFestivalForDate,
  formatFestivalSpan,
  getNextHoliday,
  getNextMakeup,
  getTodayIso,
  type CalendarCell,
  type DayStatus,
  type HolidayCountdown,
  type MonthGrid,
} from "@/lib/holiday";

type YearKey = "2025" | "2026" | "2027";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 状态 → 配色。色弱可用：每个状态同时有文字角标（休/班）兜底 */
const STATUS_META: Record<DayStatus, { label: string; mark?: string; markCls?: string; cls: string }> = {
  off: {
    label: "法定假期",
    mark: "休",
    markCls: "text-red-400",
    cls: "bg-red-500/[0.16] text-red-100 border border-red-500/30",
  },
  makeup: {
    label: "补班",
    mark: "班",
    markCls: "text-amber-400",
    cls: "bg-amber-500/[0.16] text-amber-100 border border-amber-500/30",
  },
  weekend: { label: "周末", cls: "bg-red-500/[0.06] text-red-400/80" },
  workday: { label: "工作日", cls: "text-neutral-500" },
};

const fmtShort = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
};

/* ---------- 顶部倒计时卡（useEffect 挂载后取客户端日期，避免 SSR/CSR 不一致） ---------- */
function CountdownCard({ label, data, ready, tone }: { label: string; data: HolidayCountdown | null; ready: boolean; tone: "red" | "amber" }) {
  const t =
    tone === "red"
      ? { box: "border-red-500/25 bg-red-500/[0.06]", num: "text-red-400", sub: "text-red-200/90" }
      : { box: "border-amber-500/25 bg-amber-500/[0.06]", num: "text-amber-400", sub: "text-amber-200/90" };
  return (
    <div className={`rounded-xl border p-4 ${t.box}`}>
      <div className="text-[11px] font-mono text-neutral-400 mb-1.5">{label}</div>
      {!ready ? (
        <div className="text-3xl font-mono font-semibold leading-none text-neutral-700">—</div>
      ) : data ? (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-3xl font-mono font-semibold tabular-nums leading-none ${t.num}`}>
            {data.days === 0 ? "今天" : data.days}
          </span>
          {data.days !== 0 && <span className="text-xs text-neutral-500">天</span>}
          <span className={`text-sm ${t.sub}`}>
            {data.name} · {fmtShort(data.iso)}
          </span>
        </div>
      ) : (
        <div className="text-sm font-mono text-neutral-600">已公布安排中没有更晚的日期</div>
      )}
    </div>
  );
}

/* ---------- 单日格 ---------- */
function DayCell({ cell, todayIso, onPick }: { cell: CalendarCell; todayIso: string | null; onPick: (c: CalendarCell) => void }) {
  const meta = STATUS_META[cell.status];
  const isToday = cell.iso === todayIso;
  return (
    <button
      type="button"
      onClick={() => onPick(cell)}
      aria-label={`${cell.iso} ${meta.label}${cell.festival ? ` ${cell.festival}` : ""}${isToday ? " 今天" : ""}`}
      className={`relative flex h-9 flex-col items-center justify-center rounded-md transition-colors hover:bg-white/10 ${
        isToday ? "ring-2 ring-blue-400" : ""
      } ${meta.cls}`}
    >
      <span className="text-[11px] font-mono leading-none">{cell.day}</span>
      {cell.status === "off" && cell.festivalStart && cell.festival && (
        <span className="mt-0.5 max-w-full truncate px-0.5 text-[8px] leading-none text-red-200/70">{cell.festival}</span>
      )}
      {meta.mark && (
        <span className={`absolute right-px top-px text-[8px] font-bold leading-none ${meta.markCls}`}>{meta.mark}</span>
      )}
    </button>
  );
}

/* ---------- 月历卡 ---------- */
function MonthCard({ grid, todayIso, onPick }: { grid: MonthGrid; todayIso: string | null; onPick: (c: CalendarCell) => void }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-center text-sm font-medium text-white mb-2">{grid.month}月</div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`text-center text-[10px] font-mono ${i === 0 || i === 6 ? "text-red-400/70" : "text-neutral-600"}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {grid.cells.map((c, i) =>
          c ? <DayCell key={c.iso} cell={c} todayIso={todayIso} onPick={onPick} /> : <div key={`blank-${i}`} aria-hidden />
        )}
      </div>
    </div>
  );
}

/* ---------- 图例（含文字，色弱可用） ---------- */
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-mono text-neutral-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-red-500/30 bg-red-500/[0.16] text-[8px] font-bold text-red-400">休</span>
        法定假期
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-amber-500/30 bg-amber-500/[0.16] text-[8px] font-bold text-amber-400">班</span>
        补班（周末上班）
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-4 w-4 rounded border border-white/10 bg-red-500/[0.06]" />
        周末
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-4 w-4 rounded ring-2 ring-blue-400" />
        今天
      </span>
    </div>
  );
}

/* ---------- 点击日期弹出的详情浮层 ---------- */
function DayPopover({ cell, year, official, todayIso, onClose }: {
  cell: CalendarCell;
  year: number;
  official: boolean;
  todayIso: string | null;
  onClose: () => void;
}) {
  const hit = findFestivalForDate(year, cell.iso);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${cell.iso} 详情`} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm rounded-xl border border-white/10 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 text-neutral-500 hover:text-white text-lg leading-none"
        >
          ×
        </button>
        <div className="text-white font-semibold mb-1">
          {cell.iso.replace(/-/g, " / ")} 周{WEEKDAYS[cell.weekday]}
          {cell.iso === todayIso && <span className="ml-2 text-xs font-mono text-blue-400">今天</span>}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${STATUS_META[cell.status].cls}`}>
            {STATUS_META[cell.status].label}
            {STATUS_META[cell.status].mark ? ` · ${STATUS_META[cell.status].mark}` : ""}
          </span>
        </div>
        {hit ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-sm">
            <div className="text-white mb-1">{hit.festival.name}</div>
            <p className="text-neutral-400 font-mono text-xs leading-relaxed">
              {formatFestivalSpan(hit.festival)}
            </p>
          </div>
        ) : !official ? (
          <p className="text-xs font-mono text-amber-300/90 leading-relaxed">
            {year} 年放假安排官方尚未公布，公布后此处会标注所属假期。
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- 主组件 ---------- */
export default function HolidayTool() {
  const [year, setYear] = useState<YearKey>("2026");
  const summary = useMemo(() => getHolidaySummary(Number(year)), [year]);
  const grids = useMemo(() => buildYearGrids(Number(year)), [year]);

  // hydration 安全：今天/倒计时只在客户端挂载后计算
  const [todayIso, setTodayIso] = useState<string | null>(null);
  useEffect(() => {
    setTodayIso(getTodayIso());
  }, []);
  const nextHoliday = useMemo(() => (todayIso ? getNextHoliday(todayIso) : null), [todayIso]);
  const nextMakeup = useMemo(() => (todayIso ? getNextMakeup(todayIso) : null), [todayIso]);

  const [selected, setSelected] = useState<CalendarCell | null>(null);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const downloadIcs = () => {
    const ics = buildYearIcs(Number(year));
    if (!ics || typeof URL === "undefined" || !URL.createObjectURL) return;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `china-holidays-${year}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader badge="日期" title="法定节假日" subtitle="全年月历 · 放假 / 补班 / 倒计时 · 官方通知逐条核对" tone="blue" />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Segmented
          ariaLabel="年份"
          value={year}
          onChange={setYear}
          options={AVAILABLE_YEARS.map((y) => ({ value: String(y) as YearKey, label: `${y}${y <= 2026 ? "" : " ·未公布"}` }))}
        />
      </div>

      {/* P0 倒计时卡：按客户端当前日期计算 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <CountdownCard label="距下一个假期" data={nextHoliday} ready={todayIso !== null} tone="red" />
        <CountdownCard label="距下一个补班" data={nextMakeup} ready={todayIso !== null} tone="amber" />
      </div>

      {!summary ? null : !summary.official ? (
        <div className="mb-6">
          <Hint kind="warn">
            {year} 年放假安排<span className="text-amber-200">官方尚未发布</span>（国务院通常在上年 11–12 月公布）。
            以下网格照常显示周末与工作日，<span className="text-amber-200">不做任何放假预测</span>，公布后更新。
          </Hint>
        </div>
      ) : (
        <div className="mb-4">
          <Hint kind="success">✅ 与官方通知一致：{summary.source}（数据核对至 {summary.lastVerified}）</Hint>
        </div>
      )}

      {/* P0 全年月历网格 */}
      <div className="mb-3">
        <Legend />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
        {grids.map((g) => (
          <MonthCard key={g.month} grid={g} todayIso={todayIso} onPick={setSelected} />
        ))}
      </div>

      {/* P1 全年安排表（次级区块） */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-500">
            全年安排表 · {year}
          </h2>
          {summary?.official && (
            <button
              type="button"
              onClick={downloadIcs}
              className="text-xs font-mono px-2.5 py-1 rounded-md text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-colors"
            >
              导出 .ics
            </button>
          )}
        </div>

        {!summary ? null : !summary.official ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Stat label="法定节假日天数" value={STATUTORY_HOLIDAY_DAYS} unit="天" emphasis />
              <Stat label="数据来源" value="待定" tone="warn" />
            </div>
            <AssumptionNote
              items={[
                { k: "确定事实", v: "全体公民放假节日共 11 天" },
                { k: "依据", v: "《全国年节及纪念日放假办法》" },
                { k: "连休天数", v: "取决于届时调休安排" },
                { k: "数据核对", v: `数据核对至 ${HOLIDAY_DATA_LAST_VERIFIED}；${year} 及以后年份以国务院办公厅正式通知为准，本站不预测` },
              ]}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label={`${year} 全年放假`} value={summary.totalOffDays} unit="天" emphasis tone="good" />
              <Stat label="补班(周末上班)" value={summary.totalMakeupDays} unit="天" tone="warn" />
              <Stat label="数据来源" value="国务院办公厅通知" tone="accent" />
            </div>

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
                      <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-red-300 border border-red-500/20 bg-red-500/5">
                        {d.slice(5)} 休
                      </span>
                    ))}
                    {f.makeup.map((d) => (
                      <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400 border border-amber-500/20 bg-amber-500/5">
                        {d.slice(5)} 班
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500">{formatFestivalSpan(findFestivalForDate(Number(year), f.offDates[0])!.festival)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="mt-10 text-[11px] font-mono text-neutral-600 leading-relaxed">
        2025–2026 依国务院办公厅官方通知逐条核对（核对至 {HOLIDAY_DATA_LAST_VERIFIED}），未公布年份不预测；点击日历任意日期可查看该日状态与所属假期安排。
      </p>

      {selected && summary && (
        <DayPopover
          cell={selected}
          year={Number(year)}
          official={summary.official}
          todayIso={todayIso}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
