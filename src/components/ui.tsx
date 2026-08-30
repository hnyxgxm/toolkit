"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { copyText } from "@/lib/format";
import type { ToolSeo } from "@/lib/seo";

/* ---------- 结构化数据 ---------- */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/* ---------- 工具图标 / 渐变色（首页卡片与最近使用共用） ---------- */
export const TOOL_ICON: Record<string, string> = {
  json: "{ }", base64: "B64", html: "</>", timestamp: "⏱", diff: "⇄", markdown: "M↓", qr: "▦",
  date: "📅", weekday: "7", holiday: "🎎", tax: "¥", bmi: "⚖", password: "🔒",
};

export const TOOL_TILE_GRADIENT: Record<string, string> = {
  json: "from-amber-500 to-orange-400", base64: "from-emerald-500 to-teal-400", html: "from-purple-500 to-pink-400",
  timestamp: "from-rose-500 to-red-400", diff: "from-cyan-500 to-blue-400", markdown: "from-slate-400 to-neutral-500",
  qr: "from-blue-500 to-cyan-400", date: "from-indigo-500 to-blue-400", weekday: "from-sky-500 to-cyan-400",
  holiday: "from-red-500 to-orange-400", tax: "from-green-500 to-emerald-400", bmi: "from-fuchsia-500 to-pink-400",
  password: "from-violet-500 to-purple-400",
};

/* ---------- 页面骨架 ---------- */
export function PageHeader({
  badge,
  title,
  subtitle,
  tone = "blue",
  extra,
}: {
  badge: string;
  title: string;
  subtitle: string;
  tone?: "blue" | "emerald" | "violet" | "amber";
  /** 可选：标题右侧附加内容（新增可选 prop，不影响既有调用） */
  extra?: ReactNode;
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
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${tones[tone]}`}>
          {badge}
        </span>
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        {extra}
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
            value === o.value
              ? "bg-white text-black shadow-[var(--shadow-1)]"
              : "text-neutral-500 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 徽章（新增） ---------- */
export type BadgeTone = "neutral" | "blue" | "emerald" | "violet" | "amber" | "rose";
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "text-neutral-400 border-white/[0.08] bg-white/[0.04]",
    blue: "text-blue-400 border-blue-500/20 bg-blue-500/10",
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
    violet: "text-violet-400 border-violet-500/20 bg-violet-500/10",
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/10",
    rose: "text-rose-400 border-rose-500/20 bg-rose-500/10",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono leading-none border ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ---------- 分区卡片（新增） ---------- */
export function SectionCard({
  title,
  subtitle,
  count,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-neutral-200 tracking-wide truncate">{title}</h2>
          {subtitle && <span className="text-[11px] font-mono text-neutral-600 truncate">{subtitle}</span>}
          {typeof count === "number" && (
            <span className="text-[10px] font-mono text-neutral-600 tabular-nums">× {count}</span>
          )}
        </div>
        {aside && <div className="flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
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
  className = "",
}: {
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
  /** 新增可选：附加类名，不影响既有调用 */
  className?: string;
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
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
      className={`card-hover rounded-xl border p-4 ${
        emphasis
          ? "border-blue-500/30 bg-blue-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.035]"
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

/* ============================================================
   最近使用（localStorage，无账号）
   存储 {路径 slug + 时间戳}，按 slug 去重、倒序、最多 8 条。
   仅记录站内点击（首页卡片 / 顶栏 / 最近使用自身），直接输入
   URL 进入的工具页无法被本组件感知（各工具页不在本 agent 范围）。
   ============================================================ */
const RECENT_KEY = "toolkit.recent.v1";
const RECENT_MAX = 8;

export interface RecentEntry {
  slug: string;
  ts: number;
}

export function readRecentEntries(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: RecentEntry[] = [];
    for (const it of arr) {
      if (it && typeof it === "object" && typeof (it as RecentEntry).slug === "string" && typeof (it as RecentEntry).ts === "number") {
        const e = it as RecentEntry;
        if (!seen.has(e.slug)) {
          seen.add(e.slug);
          out.push({ slug: e.slug, ts: e.ts });
        }
      }
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function recordToolVisit(slug: string) {
  if (typeof window === "undefined" || !slug) return;
  try {
    const rest = readRecentEntries().filter((e) => e.slug !== slug);
    const next = [{ slug, ts: Date.now() }, ...rest].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式等场景下静默降级 */
  }
}

/** 最近使用区：挂在首页，空态不渲染（避免 SSR/首屏闪烁） */
export function RecentTools({ tools }: { tools: ToolSeo[] }) {
  const [recent, setRecent] = useState<ToolSeo[]>([]);

  useEffect(() => {
    const entries = readRecentEntries();
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    setRecent(entries.map((e) => bySlug.get(e.slug)).filter((t): t is ToolSeo => !!t));
  }, [tools]);

  if (recent.length === 0) return null;

  return (
    <section className="mb-12" aria-label="最近使用">
      <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-600 mb-4">
        <span className="w-1 h-1 rounded-full bg-emerald-500" />
        最近使用
        <span className="text-neutral-800 tabular-nums">· {recent.length}</span>
      </h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {recent.map((t) => (
          <Link
            key={t.slug}
            href={`/${t.slug}`}
            onClick={() => recordToolVisit(t.slug)}
            className="card-hover shrink-0 flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
            title={t.subtitle}
          >
            <span className={`w-7 h-7 rounded-full bg-gradient-to-br ${TOOL_TILE_GRADIENT[t.slug] ?? "from-neutral-500 to-neutral-600"} flex items-center justify-center text-[11px] font-bold text-white`}>
              {TOOL_ICON[t.slug] ?? "·"}
            </span>
            <span className="text-sm text-neutral-200 whitespace-nowrap">{t.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   顶栏导航（客户端：点击埋点记录最近使用 + 当前路径高亮）
   ============================================================ */
export interface NavItem {
  slug: string;
  label: string;
  title?: string;
}

function useActiveSlug() {
  const pathname = usePathname();
  const seg = pathname?.split("/").filter(Boolean)[0];
  return seg ?? "";
}

/** 桌面端横滚链接（<768px 由 MobileNav 接管） */
export function DesktopNavLinks({ items }: { items: NavItem[] }) {
  const active = useActiveSlug();
  return (
    <div className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
      {items.map((it) => (
        <Link
          key={it.slug}
          href={`/${it.slug}`}
          title={it.title}
          aria-current={active === it.slug ? "page" : undefined}
          onClick={() => recordToolVisit(it.slug)}
          className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs font-mono rounded-md transition-colors ${
            active === it.slug
              ? "text-white bg-white/[0.08]"
              : "text-neutral-400 hover:text-white hover:bg-white/[0.06]"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

/** 移动端抽屉导航（<768px 显示汉堡按钮 + 展开面板） */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const active = useActiveSlug();

  // 路由变化时收起（点击链接跳转后）
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="md:hidden relative">
      <button
        type="button"
        aria-label={open ? "关闭导航" : "打开导航"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
      >
        <span className={`block w-4 h-px bg-neutral-300 transition-transform ${open ? "translate-y-[2.5px] rotate-45" : ""}`} />
        <span className={`block w-4 h-px bg-neutral-300 transition-transform ${open ? "-translate-y-[2.5px] -rotate-45" : ""}`} />
      </button>
      {open && (
        <>
          {/* 点击遮罩关闭 */}
          <div className="fixed inset-0 top-14 z-40 bg-black/50" onClick={close} aria-hidden="true" />
          <nav
            aria-label="全部工具"
            className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-white/[0.08] bg-[#101013]/95 backdrop-blur-xl shadow-[var(--shadow-lift)] p-2 max-h-[70vh] overflow-y-auto"
          >
            {items.map((it) => (
              <Link
                key={it.slug}
                href={`/${it.slug}`}
                onClick={() => {
                  recordToolVisit(it.slug);
                  close();
                }}
                aria-current={active === it.slug ? "page" : undefined}
                className={`block whitespace-nowrap px-3 py-2 text-sm font-mono rounded-md transition-colors ${
                  active === it.slug
                    ? "text-white bg-white/[0.08]"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {it.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
