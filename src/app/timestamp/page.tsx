"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface TimeInfo {
  type: "valid" | "warning" | "error";
  message: string;
}

function validateTimestamp(ts: number): TimeInfo {
  const now = Math.floor(Date.now() / 1000);
  const year2000 = 946684800;
  const year2100 = 4102444800;

  if (ts < 0) {
    return { type: "error", message: "负数时间戳表示 1970 年之前" };
  }
  if (ts < year2000) {
    return { type: "warning", message: "时间在 2000 年之前" };
  }
  if (ts > year2100) {
    return { type: "warning", message: "时间在 2100 年之后" };
  }
  if (ts > now + 86400 * 365) {
    return { type: "warning", message: "这是一个未来超过 1 年的时间" };
  }
  if (ts > now - 86400 && ts < now) {
    return { type: "valid", message: "这是最近的时间" };
  }
  return { type: "valid", message: "" };
}

export default function TimestampPage() {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"now" | "convert">("now");

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return {
      full: d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      iso: d.toISOString(),
      date: d.toLocaleDateString("zh-CN"),
      time: d.toLocaleTimeString("zh-CN"),
      weekday: d.toLocaleDateString("zh-CN", { weekday: "long" }),
    };
  };

  const { result, timeInfo } = useMemo(() => {
    if (mode === "now") return { result: null, timeInfo: null };
    const trimmed = input.trim();
    if (!trimmed) return { result: "", timeInfo: null };

    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      const ts = num > 1e12 ? Math.floor(num / 1000) : num;
      const f = formatDate(ts);
      const info = validateTimestamp(ts);
      return {
        result: `完整: ${f.full}\n星期: ${f.weekday}\nISO: ${f.iso}\n日期: ${f.date}\n时间: ${f.time}`,
        timeInfo: info,
      };
    }

    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const ts = Math.floor(date.getTime() / 1000);
      const info = validateTimestamp(ts);
      return {
        result: `时间戳 (秒): ${ts}\n时间戳 (毫秒): ${ts * 1000}\nISO: ${date.toISOString()}\n星期: ${date.toLocaleDateString("zh-CN", { weekday: "long" })}`,
        timeInfo: info,
      };
    }

    return { result: "无法解析，请输入有效的时间戳或日期", timeInfo: { type: "error" as const, message: "格式不正确" } };
  }, [input, mode]);

  const current = formatDate(now);

  return (
    <div>
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-600 hover:text-white mb-8 transition-colors">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </Link>

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-rose-400 border border-rose-500/20 bg-rose-500/10">
            转换
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">时间戳转换</h1>
        </div>
        <p className="text-sm text-neutral-500 font-mono">Unix 时间戳 ↔ 可读时间 · 校验 · 智能提示</p>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="flex bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
          <button
            onClick={() => setMode("now")}
            className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
              mode === "now" ? "bg-white text-black" : "text-neutral-500 hover:text-white"
            }`}
          >
            实时
          </button>
          <button
            onClick={() => setMode("convert")}
            className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
              mode === "convert" ? "bg-white text-black" : "text-neutral-500 hover:text-white"
            }`}
          >
            转换
          </button>
        </div>
      </div>

      {mode === "now" ? (
        <div className="space-y-6">
          <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
            <div className="relative z-10">
              <div className="text-6xl font-mono font-bold text-white mb-2 tracking-tighter">
                {now}
              </div>
              <div className="text-xs font-mono text-neutral-500 uppercase tracking-widest">unix timestamp</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "秒", value: `${now}` },
              { label: "毫秒", value: `${now}000` },
              { label: "完整", value: current.full },
              { label: "星期", value: current.weekday },
              { label: "ISO", value: current.iso },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <div className="text-[10px] font-mono text-neutral-600 mb-1 uppercase tracking-wider">{item.label}</div>
                <div className="font-mono text-xs text-neutral-300 break-all">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">输入</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"时间戳: 1692432000\n日期: 2024-08-20 12:00:00\n毫秒: 1692432000000"}
              className="w-full h-48 px-4 py-3 rounded-xl font-mono text-sm resize-none"
            />
            <div className="mt-2 text-xs font-mono text-neutral-600">
              支持：秒级/毫秒级时间戳 · ISO 日期 · 本地日期格式
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">结果</label>
              {timeInfo && timeInfo.type === "valid" && timeInfo.message && (
                <span className="text-xs font-mono text-emerald-400">{timeInfo.message}</span>
              )}
              {timeInfo && timeInfo.type === "warning" && (
                <span className="text-xs font-mono text-amber-400">⚠ {timeInfo.message}</span>
              )}
              {timeInfo && timeInfo.type === "error" && (
                <span className="text-xs font-mono text-red-400">✕ {timeInfo.message}</span>
              )}
            </div>
            <div className="w-full h-48 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap text-neutral-300">
              {result || <span className="text-neutral-600">转换结果</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
