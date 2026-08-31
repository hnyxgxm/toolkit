"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Stat, Hint, CopyButton } from "@/components/ui";
import { weekdayInfo, weekdayInfoLines, shiftISO, monthMatrix } from "@/lib/date";

const CARD = "rounded-xl border border-white/[0.06] bg-white/[0.02] p-5";
const LABEL = "block text-[11px] font-mono text-neutral-500 uppercase tracking-wider";
const INPUT = "w-full px-4 py-3 rounded-xl font-mono text-[15px]";
const WEEK_HEADS = ["一", "二", "三", "四", "五", "六", "日"];

/** 客户端专用（仅在 effect/事件回调中调用，不影响 hydration） */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function QuickBtn({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-mono px-3 py-1.5 rounded-md border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
    >
      {children}
    </button>
  );
}

export default function WeekdayTool() {
  // 初始留空保证 SSR 首帧确定性，挂载后定位到今天
  const [date, setDate] = useState("");
  const [today, setToday] = useState("");
  const [batchInput, setBatchInput] = useState("");

  useEffect(() => {
    const t = todayISO();
    setDate(t);
    setToday(t);
  }, []);

  const info = useMemo(() => weekdayInfo(date), [date]);
  const rows = useMemo(
    () => (date && info ? monthMatrix(info.year, Number(date.slice(5, 7))) : []),
    [date, info],
  );

  const batchRows = useMemo(() => weekdayInfoLines(batchInput), [batchInput]);
  const batchOk = batchRows.flatMap((r) => (r.info ? [{ raw: r.raw, info: r.info }] : []));
  const batchCopyText = batchOk
    .map((r) => `${r.raw} ${r.info.cn} · 年内第 ${r.info.dayOfYear} 天 · ISO 第 ${r.info.isoWeekWeek} 周`)
    .join("\n");

  return (
    <div>
      <PageHeader badge="日期" title="日期查星期" subtitle="星期几 · 年内第 N 天 · ISO 周数 · 闰年 · 迷你日历 · 批量查询" tone="violet" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ①② 主查询：输入即显示 + 今天/前一天/后一天快捷 */}
        <div className="space-y-4">
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className={LABEL}>选择日期</label>
              <div className="flex gap-2">
                <QuickBtn onClick={() => setDate((v) => shiftISO(v, -1) ?? v)}>前一天</QuickBtn>
                <QuickBtn onClick={() => setDate(todayISO())}>今天</QuickBtn>
                <QuickBtn onClick={() => setDate((v) => shiftISO(v, 1) ?? v)}>后一天</QuickBtn>
              </div>
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} aria-label="选择日期" />
          </div>

          {date === "" ? (
            <Hint kind="info">选择日期后自动显示结果</Hint>
          ) : !info ? (
            <Hint kind="error">请输入有效日期（YYYY-MM-DD）</Hint>
          ) : (
            <div className="space-y-4">
              <Stat
                label={`${info.iso} · ${info.isWeekend ? "周末" : "工作日"}`}
                value={info.cn}
                emphasis
                tone={info.isWeekend ? "warn" : "accent"}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat label="年内第 N 天" value={`第 ${info.dayOfYear} 天`} />
                <Stat label="周数（ISO 口径）" value={`第 ${info.isoWeekWeek} 周`} />
                <Stat label={`公历 ${info.year} 年`} value={info.isLeap ? "闰年（366 天）" : "平年（365 天）"} tone={info.isLeap ? "accent" : "default"} />
              </div>
              <Hint kind="info">
                ISO 8601 周口径：周一为一周之始，含当年首个周四的那一周为第 1 周。所在周：{info.isoWeekFrom} ~ {info.isoWeekTo}。
              </Hint>
            </div>
          )}
        </div>

        {/* ③ 当月迷你日历，高亮目标日（可点选任意日） */}
        <div className={CARD}>
          <div className="flex items-center justify-between mb-3">
            <span className={LABEL}>
              {info ? `${info.year} 年 ${Number(date.slice(5, 7))} 月` : "当月日历"}
            </span>
            <span className="text-[10px] font-mono text-neutral-600">周一为首列 · 点击可选中</span>
          </div>
          {info ? (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEK_HEADS.map((h, i) => (
                  <div key={h} className={`text-center text-[10px] font-mono py-1 ${i >= 5 ? "text-amber-400/70" : "text-neutral-600"}`}>
                    {h}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {rows.flat().map((cell, i) =>
                  cell === null ? (
                    <span key={`e${i}`} />
                  ) : (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => setDate(cell)}
                      className={`h-8 flex items-center justify-center rounded-md text-xs font-mono transition-colors ${
                        cell === date
                          ? "bg-blue-500 text-black font-semibold"
                          : cell === today
                            ? "ring-1 ring-inset ring-emerald-500/60 text-emerald-300"
                            : i % 7 >= 5
                              ? "text-amber-400/80 hover:bg-white/[0.06]"
                              : "text-neutral-400 hover:bg-white/[0.06]"
                      }`}
                    >
                      {Number(cell.slice(8, 10))}
                    </button>
                  ),
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-neutral-600">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />目标日</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded ring-1 ring-emerald-500/60 inline-block" />今天</span>
                <span className="flex items-center gap-1"><span className="text-amber-400/80">六/日</span>周末列</span>
              </div>
            </>
          ) : (
            <Hint kind="info">选择日期后展示当月日历</Hint>
          )}
        </div>
      </div>

      {/* ④ 多行批量查询 */}
      <div className={`${CARD} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <label className={LABEL}>批量查询（每行一个日期 YYYY-MM-DD，空行忽略）</label>
          {batchOk.length > 0 && <CopyButton text={batchCopyText} label={`复制全部结果（${batchOk.length} 条）`} />}
        </div>
        <textarea
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          rows={7}
          placeholder={"2026-01-01\n2026-08-30"}
          className={`${INPUT} resize-y leading-relaxed`}
        />
        {batchRows.length > 0 && (
          <div className="mt-3 space-y-1">
            {batchRows.map((r) =>
              r.info ? (
                <div key={r.raw} className="flex items-center justify-between gap-3 text-xs font-mono py-1 border-b border-white/[0.04] last:border-0">
                  <span className="text-neutral-400 tabular-nums flex-shrink-0">{r.raw}</span>
                  <span className="min-w-0 truncate">
                    <span className={r.info.isWeekend ? "text-amber-400" : "text-emerald-400"}>{r.info.cn}</span>
                    <span className="text-neutral-500"> · 年内第 {r.info.dayOfYear} 天 · ISO 第 {r.info.isoWeekWeek} 周 · {r.info.isLeap ? "闰年" : "平年"}</span>
                  </span>
                  <CopyButton text={`${r.raw} ${r.info.cn} · 年内第 ${r.info.dayOfYear} 天 · ISO 第 ${r.info.isoWeekWeek} 周`} label="复制" />
                </div>
              ) : (
                <div key={r.raw} className="flex items-center justify-between gap-3 text-xs font-mono py-1 border-b border-white/[0.04] last:border-0">
                  <span className="text-neutral-400 flex-shrink-0">{r.raw}</span>
                  <span className="text-red-400">日期格式应为 YYYY-MM-DD，且为真实存在的日期</span>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
