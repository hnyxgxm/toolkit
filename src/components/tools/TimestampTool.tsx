"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Stat, CopyButton, Hint } from "@/components/ui";

function fmtLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function isoOf(ms: number): string {
  return new Date(ms).toISOString();
}

export default function TimestampTool() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [tsInput, setTsInput] = useState(String(Math.floor(Date.now() / 1000)));
  const [dateInput, setDateInput] = useState("");

  const decoded = useMemo(() => {
    const raw = tsInput.trim();
    if (!/^\d+$/.test(raw)) return { ms: null as number | null, unit: "", error: "时间戳只能是纯数字" };
    const num = Number(raw);
    const isMs = raw.length >= 13;
    const ms = isMs ? num : num * 1000;
    if (!isFinite(ms) || ms < 0) return { ms: null, unit: "", error: "时间戳超出有效范围" };
    return { ms, unit: isMs ? "毫秒" : "秒", error: "" };
  }, [tsInput]);

  const encoded = useMemo(() => {
    if (!dateInput) return { ms: null as number | null, error: "" };
    const ms = new Date(dateInput).getTime();
    if (isNaN(ms)) return { ms: null, error: "无法解析该日期时间" };
    return { ms, error: "" };
  }, [dateInput]);

  const nowSec = Math.floor(now / 1000);

  return (
    <div>
      <PageHeader badge="转换" title="时间戳转换" subtitle="Unix 秒/毫秒 ↔ 本地时间 · 实时当前值" tone="amber" />

      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat label="当前时间戳(秒)" value={nowSec} emphasis tone="accent" />
        <Stat label="当前时间戳(毫秒)" value={now} />
        <Stat label="本地时间" value={fmtLocal(now)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 时间戳 → 日期 */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">时间戳 → 日期</label>
          <input value={tsInput} onChange={(e) => setTsInput(e.target.value)} placeholder="1700000000" className="w-full px-4 py-2.5 rounded-xl font-mono text-sm mb-3" />
          {decoded.error ? (
            <Hint kind="error">{decoded.error}</Hint>
          ) : (
            <div className="space-y-1.5 font-mono text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">识别单位</span><span className="text-blue-400">{decoded.unit}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">本地</span><span className="text-neutral-200">{fmtLocal(decoded.ms!)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">UTC</span><span className="text-neutral-200">{isoOf(decoded.ms!)}</span></div>
              <div className="pt-2"><CopyButton text={fmtLocal(decoded.ms!)} label="复制本地时间" /></div>
            </div>
          )}
        </div>

        {/* 日期 → 时间戳 */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">日期 → 时间戳</label>
          <input type="datetime-local" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="w-full px-4 py-2.5 rounded-xl font-mono text-sm mb-3" />
          {encoded.error ? (
            <Hint kind="error">{encoded.error}</Hint>
          ) : encoded.ms === null ? (
            <Hint kind="info">选择日期时间以生成时间戳</Hint>
          ) : (
            <div className="space-y-1.5 font-mono text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">秒</span><span className="text-neutral-200">{Math.floor(encoded.ms / 1000)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">毫秒</span><span className="text-neutral-200">{encoded.ms}</span></div>
              <div className="pt-2 flex gap-2">
                <CopyButton text={String(Math.floor(encoded.ms / 1000))} label="复制秒" />
                <CopyButton text={String(encoded.ms)} label="复制毫秒" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
