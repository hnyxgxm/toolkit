"use client";

import Link from "next/link";
import { useState, useCallback, type ReactNode } from "react";
import { copyText } from "@/lib/format";

/* ---------- 结构化数据 ---------- */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/* ---------- 页面骨架 ---------- */
export function PageHeader({
  badge,
  title,
  subtitle,
  tone = "blue",
}: {
  badge: string;
  title: string;
  subtitle: string;
  tone?: "blue" | "emerald" | "violet" | "amber";
}) {
  const tones: Record<string, string> = {
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/10",
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    violet: "text-violet-400 border-violet-500/20 bg-violet-500/10",
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/10",
  };
  return (
    <header className="mb-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-600 hover:text-white mb-8 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回全部工具
      </Link>
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${tones[tone]}`}>
          {badge}
        </span>
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
      </div>
      <p className="text-sm text-neutral-500 font-mono">{subtitle}</p>
    </header>
  );
}

/* ---------- 分段控制器 ---------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
            value === o.value ? "bg-white text-black" : "text-neutral-500 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 开关 ---------- */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
      <span className="text-sm text-neutral-300">
        {label}
        {hint && <span className="ml-1.5 text-xs text-neutral-600 font-mono">{hint}</span>}
      </span>
    </label>
  );
}

/* ---------- 数字/文本输入（带校验） ---------- */
export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">{label}</label>
        {hint && <span className="text-[10px] font-mono text-neutral-600">{hint}</span>}
      </div>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-400 font-mono flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-red-500" />
          {error}
        </p>
      )}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  suffix,
  invalid,
}: {
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-2.5 rounded-xl font-mono text-sm pr-14 ${
          invalid ? "border-red-500/50" : ""
        }`}
      />
      {suffix && <span className="absolute right-4 text-xs font-mono text-neutral-600 pointer-events-none">{suffix}</span>}
    </div>
  );
}

/* ---------- 结果统计卡 ---------- */
export function Stat({
  label,
  value,
  unit,
  tone = "default",
  emphasis,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "good" | "bad" | "warn" | "accent";
  emphasis?: boolean;
}) {
  const tones: Record<string, string> = {
    default: "text-neutral-200",
    good: "text-emerald-400",
    bad: "text-red-400",
    warn: "text-amber-400",
    accent: "text-blue-400",
  };
  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasis
          ? "border-blue-500/30 bg-blue-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div className="text-[11px] font-mono text-neutral-500 mb-1.5">{label}</div>
      <div className={`font-mono tabular-nums ${emphasis ? "text-2xl" : "text-xl"} font-semibold ${tones[tone]}`}>
        {value}
        {unit && <span className="text-xs text-neutral-500 ml-1 font-normal">{unit}</span>}
      </div>
    </div>
  );
}

/* ---------- 空/错误态 ---------- */
export function Hint({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const map = {
    info: { c: "border-white/[0.06] bg-white/[0.02] text-neutral-400", d: "•" },
    error: { c: "border-red-500/20 bg-red-500/5 text-red-300", d: "!" },
    success: { c: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300", d: "✓" },
    warn: { c: "border-amber-500/20 bg-amber-500/5 text-amber-300", d: "⚠" },
  }[kind];
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm font-mono ${map.c}`}>
      <span className="mt-0.5 w-4 h-4 rounded-full bg-current/10 flex items-center justify-center text-[10px] flex-shrink-0">
        {map.d}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
}

/* ---------- 显式假设说明 ---------- */
export function AssumptionNote({ items }: { items: Array<{ k: string; v: string }> }) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-violet-400 text-sm">ⓘ</span>
        <span className="text-xs font-mono uppercase tracking-wider text-violet-400">计算假设 · 可展开核对</span>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
        {items.map((it) => (
          <div key={it.k} className="text-xs font-mono">
            <dt className="text-neutral-500">{it.k}</dt>
            <dd className="text-neutral-300">{it.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ---------- 复制按钮（带 toast） ---------- */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const onCopy = useCallback(async () => {
    const ok = await copyText(text);
    setState(ok ? "ok" : "fail");
    setTimeout(() => setState("idle"), 1500);
  }, [text]);
  if (!text) return null;
  return (
    <button
      onClick={onCopy}
      className={`text-xs font-mono px-2.5 py-1 rounded-md transition-colors ${
        state === "ok"
          ? "text-emerald-400 bg-emerald-500/10"
          : state === "fail"
          ? "text-red-400 bg-red-500/10"
          : "text-blue-400 hover:text-blue-300 hover:bg-white/[0.05]"
      }`}
      aria-live="polite"
    >
      {state === "ok" ? "已复制" : state === "fail" ? "失败" : label}
    </button>
  );
}
