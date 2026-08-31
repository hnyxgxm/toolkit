"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, CopyButton, Hint } from "@/components/ui";
import {
  parseTimestamp,
  parseTimestampLines,
  parseLocalInput,
  fmtLocal,
  fmtUTC,
  iso8601,
  relativeTimeCN,
  toLocalInputValue,
} from "@/lib/timestamp";

const CARD = "rounded-xl border border-white/[0.06] bg-white/[0.02] p-5";
const LABEL = "block text-[11px] font-mono text-neutral-500 uppercase tracking-wider";
const INPUT = "w-full px-4 py-3 rounded-xl font-mono text-[15px]";

/** 输出行：标签 + 值 + 逐项复制 */
function OutputRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs font-mono text-neutral-500 flex-shrink-0">{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm text-neutral-200 truncate tabular-nums">{value}</span>
        <CopyButton text={value} label="复制" />
      </span>
    </div>
  );
}

export default function TimestampTool() {
  // —— 实时时钟：挂载后再启动，避免 SSR 与客户端首帧不一致 ——
  const [now, setNow] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const [tzName, setTzName] = useState("本地时区");
  const [tsInput, setTsInput] = useState("");
  const [dtLocal, setDtLocal] = useState("");
  const [batchInput, setBatchInput] = useState("");

  useEffect(() => {
    setNow(Date.now());
    setTzName(() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "本地时区";
      } catch {
        return "本地时区";
      }
    });
    setTsInput((v) => (v === "" ? String(Math.floor(Date.now() / 1000)) : v));
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // —— 时间戳 → 日期（双向之一）——
  const decoded = useMemo(() => {
    if (tsInput.trim() === "") return { kind: "empty" as const };
    const r = parseTimestamp(tsInput);
    return r.ok ? { kind: "ok" as const, ms: r.ms, unit: r.unit === "ms" ? "毫秒" : "秒" } : { kind: "error" as const, error: r.error };
  }, [tsInput]);

  // —— 日期 → 时间戳（双向之二）——
  const dayPart = dtLocal ? dtLocal.slice(0, 10) : "";
  const timePart = dtLocal.includes("T") ? dtLocal.slice(11, 16) : "00:00";
  const encodedMs = useMemo(() => parseLocalInput(dtLocal), [dtLocal]);

  // —— 批量转换 ——
  const batchRows = useMemo(() => parseTimestampLines(batchInput), [batchInput]);
  const batchOk = batchRows.flatMap((r) => (r.parsed.ok ? [{ raw: r.raw, ms: r.parsed.ms }] : []));
  const batchCopyText = batchOk.map((r) => `${r.raw} → ${fmtLocal(r.ms)}`).join("\n");

  return (
    <div>
      <PageHeader badge="转换" title="时间戳转换" subtitle="Unix 秒/毫秒 ↔ 日期时间 · 实时当前值 · 批量转换" tone="amber" />

      {/* ① 顶部常驻：当前时间戳秒/毫秒双显，实时刷新可暂停，一键复制 */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <span className={LABEL}>当前时间戳 · 实时</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-500">
              <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {live ? "每秒刷新" : "已暂停"}
            </span>
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className="text-xs font-mono px-2.5 py-1 rounded-md border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              {live ? "暂停刷新" : "继续刷新"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/[0.06] p-4">
            <div className="text-[11px] font-mono text-neutral-500 mb-1.5">当前秒（10 位）</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-blue-400 tabular-nums truncate">
                {now === null ? "—" : Math.floor(now / 1000)}
              </span>
              {now !== null && <CopyButton text={String(Math.floor(now / 1000))} label="复制" />}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[11px] font-mono text-neutral-500 mb-1.5">当前毫秒（13 位）</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xl font-semibold text-neutral-200 tabular-nums truncate">
                {now === null ? "—" : now}
              </span>
              {now !== null && <CopyButton text={String(now)} label="复制" />}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="text-[11px] font-mono text-neutral-500 mb-1.5">本地时间 · {tzName}</div>
            <div className="font-mono text-xl font-semibold text-neutral-200 tabular-nums">
              {now === null ? "—" : fmtLocal(now)}
            </div>
          </div>
        </div>
      </div>

      {/* ②③ 双向转换 + 批量 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 时间戳 → 日期时间 */}
        <div className={CARD}>
          <label className={`${LABEL} mb-2`}>时间戳 → 日期时间</label>
          <div className="flex gap-2 mb-3">
            <input
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value)}
              placeholder="1700000000"
              inputMode="numeric"
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => setTsInput(String(Math.floor(Date.now() / 1000)))}
              className="flex-shrink-0 text-xs font-mono px-3 py-2 rounded-xl border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              现在
            </button>
          </div>

          {decoded.kind === "empty" ? (
            <Hint kind="info">粘贴 10 位（秒）或 13 位（毫秒）时间戳，自动识别单位</Hint>
          ) : decoded.kind === "error" ? (
            <Hint kind="error">{decoded.error}</Hint>
          ) : (
            <div>
              <div className="mb-2 text-xs font-mono">
                识别单位：
                <span className="text-blue-400">{decoded.unit}</span>
              </div>
              <OutputRow label="ISO 8601" value={iso8601(decoded.ms)} />
              <OutputRow label="本地时间" value={fmtLocal(decoded.ms)} />
              <OutputRow label="UTC 时间" value={fmtUTC(decoded.ms)} />
              <OutputRow label="相对时间" value={now === null ? "—" : relativeTimeCN(decoded.ms, now)} />
            </div>
          )}
        </div>

        {/* ④ 日期时间 → 时间戳：datetime-local + date 双选择器 + 现在 */}
        <div className={CARD}>
          <label className={`${LABEL} mb-2`}>日期时间 → 时间戳</label>
          <div className="space-y-2.5 mb-3">
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={dtLocal}
                onChange={(e) => setDtLocal(e.target.value)}
                className={INPUT}
                aria-label="选择日期时间"
              />
              <button
                type="button"
                onClick={() => setDtLocal(toLocalInputValue(Date.now()))}
                className="flex-shrink-0 text-xs font-mono px-3 py-2 rounded-xl border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                现在
              </button>
            </div>
            <input
              type="date"
              value={dayPart}
              onChange={(e) => setDtLocal(e.target.value ? `${e.target.value}T${timePart}` : "")}
              className={INPUT}
              aria-label="选择日期（保留已选时刻）"
            />
          </div>

          {dtLocal === "" ? (
            <Hint kind="info">选择日期时间（本地时区），或点击「现在」</Hint>
          ) : encodedMs === null ? (
            <Hint kind="error">无法解析该日期时间</Hint>
          ) : (
            <div>
              <OutputRow label="Unix 秒" value={String(Math.floor(encodedMs / 1000))} />
              <OutputRow label="Unix 毫秒" value={String(encodedMs)} />
              <div className="mt-2 text-xs font-mono text-neutral-500">
                对应本地时间：<span className="text-neutral-300">{fmtLocal(encodedMs)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ③ 多行批量转换 + 批量复制 */}
      <div className={`${CARD} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <label className={LABEL}>批量转换（每行一个时间戳，空行忽略）</label>
          {batchOk.length > 0 && <CopyButton text={batchCopyText} label={`复制全部结果（${batchOk.length} 条）`} />}
        </div>
        <textarea
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          rows={7}
          placeholder={"1700000000\n1700000000000"}
          className={`${INPUT} resize-y leading-relaxed`}
        />
        {batchRows.length > 0 && (
          <div className="mt-3 space-y-1">
            {batchRows.map((r) =>
              r.parsed.ok ? (
                <div key={r.raw} className="flex items-center justify-between gap-3 text-xs font-mono py-1 border-b border-white/[0.04] last:border-0">
                  <span className="text-neutral-400 tabular-nums flex-shrink-0">{r.raw}</span>
                  <span className="text-emerald-400 truncate tabular-nums">{fmtLocal(r.parsed.ms)}</span>
                  <CopyButton text={`${r.raw} → ${fmtLocal(r.parsed.ms)}`} label="复制" />
                </div>
              ) : (
                <div key={r.raw} className="flex items-center justify-between gap-3 text-xs font-mono py-1 border-b border-white/[0.04] last:border-0">
                  <span className="text-neutral-400 flex-shrink-0">{r.raw}</span>
                  <span className="text-red-400">{r.parsed.error}</span>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
