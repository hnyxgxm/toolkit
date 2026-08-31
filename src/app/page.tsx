"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ALL_TOOLS, TOOL_GROUPS } from "@/lib/seo";
import { Badge, RecentTools, recordToolVisit, TOOL_ICON, TOOL_TILE_GRADIENT } from "@/components/ui";

/** 搜索预设标签：一键填入，对标 uutool */
const PRESET_TAGS = ["格式化", "编码", "转换", "日期", "节假日", "个税", "BMI", "密码", "二维码", "对比"];

export default function Home() {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!q) return TOOL_GROUPS.map((g) => ({ ...g, items: g.items }));
    return TOOL_GROUPS
      .map((g) => ({
        ...g,
        items: g.items.filter((t) => {
          const hay = [t.title, t.subtitle, t.description, t.slug, g.group, ...t.keywords]
            .join(" ")
            .toLowerCase();
          return q.split(/\s+/).every((word) => hay.includes(word));
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [q]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  return (
    <div>
      {/* ---------- Hero ---------- */}
      <section className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-xs font-mono text-neutral-500 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          免费 · 无需注册 · 全部本地运算
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          <span className="bg-gradient-to-r from-white via-white to-neutral-500 bg-clip-text text-transparent">
            极客工具箱
          </span>
        </h1>
        <p className="text-base sm:text-lg text-neutral-500 max-w-md mx-auto">
          {ALL_TOOLS.length} 个原子化在线工具，按 <span className="text-neutral-400">开发者 / 日期时间 / 生活计算</span> 三类整理
        </p>
      </section>

      {/* ---------- 搜索 + 预设标签 ---------- */}
      <section className="mb-12" aria-label="搜索工具">
        <div className="relative max-w-xl mx-auto">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索工具：名称、关键词，如「json」「节假日」…"
            aria-label="搜索工具"
            className="w-full pl-11 pr-10 py-3 rounded-2xl text-sm font-mono"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-neutral-400 hover:text-white text-xs flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-4" aria-label="预设搜索标签">
          {PRESET_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setQuery(query.trim() === tag ? "" : tag)}
              aria-pressed={query.trim() === tag}
              className={`px-3 py-1 rounded-full text-xs font-mono border transition-colors ${
                query.trim() === tag
                  ? "text-blue-300 border-blue-500/40 bg-blue-500/10"
                  : "text-neutral-500 border-white/[0.06] bg-white/[0.02] hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* ---------- 最近使用（localStorage，空态自动隐藏） ---------- */}
      {!q && <RecentTools tools={ALL_TOOLS} />}

      {/* ---------- 搜索结果摘要 ---------- */}
      {q && (
        <p className="text-xs font-mono text-neutral-500 mb-6" aria-live="polite">
          找到 <span className="text-neutral-300 tabular-nums">{total}</span> 个匹配「{query.trim()}」的工具
        </p>
      )}

      {/* ---------- 分组卡片 ---------- */}
      {groups.map((group) => (
        <section key={group.group} className="mb-12">
          <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-600 mb-4">
            <span className="w-1 h-1 rounded-full bg-blue-500" />
            {group.group}
            <span className="text-neutral-800 tabular-nums">· {group.items.length}</span>
            {q && <span className="text-neutral-700 normal-case tracking-normal">（共 {group.items.length} 个）</span>}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
            {group.items.map((t) => (
              <Link
                key={t.slug}
                href={`/${t.slug}`}
                onClick={() => recordToolVisit(t.slug)}
                className="card-hover group relative p-4 sm:p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] flex flex-col gap-3 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${TOOL_TILE_GRADIENT[t.slug]} opacity-0 group-hover:opacity-[0.05] transition-opacity duration-500 pointer-events-none`} />
                <div className="relative z-10 flex items-center gap-3">
                  <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${TOOL_TILE_GRADIENT[t.slug]} flex items-center justify-center text-base font-bold font-mono text-white shadow-[var(--shadow-1)]`}>
                    {TOOL_ICON[t.slug]}
                  </span>
                  <span className="text-sm sm:text-base font-semibold text-neutral-200 group-hover:text-white transition-colors leading-snug min-w-0">
                    {t.title}
                  </span>
                </div>
                <p className="relative z-10 text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors leading-relaxed line-clamp-2 flex-1">
                  {t.subtitle}
                </p>
                <div className="relative z-10 flex items-center justify-between gap-2">
                  <Badge>{group.group}</Badge>
                  <svg
                    className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-300 group-hover:translate-x-0.5 transition-all"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {/* ---------- 搜索空态 ---------- */}
      {q && total === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-neutral-400 mb-2">没有找到「{query.trim()}」相关的工具</p>
          <p className="text-xs font-mono text-neutral-600">试试「格式化」「日期」「密码」等标签，或换个关键词</p>
        </div>
      )}

      <div className="mt-16 text-center">
        <p className="text-xs font-mono text-neutral-700">built with simplicity &amp; correctness in mind</p>
      </div>
    </div>
  );
}
