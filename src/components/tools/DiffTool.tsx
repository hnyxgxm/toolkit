"use client";

import { useMemo, useState } from "react";
import { PageHeader, Stat, Hint } from "@/components/ui";
import { diffText, MAX_LINES, type DiffLine } from "@/lib/diff";

export default function DiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const { lines, stats, trunc } = useMemo(() => diffText(a, b), [a, b]);

  const bg: Record<DiffLine["type"], string> = {
    same: "text-neutral-500",
    add: "text-emerald-400 bg-emerald-500/[0.06]",
    del: "text-red-400 bg-red-500/[0.06]",
  };
  const sign: Record<DiffLine["type"], string> = { same: " ", add: "+", del: "-" };

  return (
    <div>
      <PageHeader badge="对比" title="文本对比 Diff" subtitle="逐行 LCS 差异 · 新增/删除统计" tone="blue" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">原始 A</label>
          <textarea value={a} onChange={(e) => setA(e.target.value)} className="w-full h-[300px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">对比 B</label>
          <textarea value={b} onChange={(e) => setB(e.target.value)} className="w-full h-[300px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
      </div>

      {!a && !b ? (
        <Hint kind="info">在上方输入两段文本，实时查看差异。</Hint>
      ) : (
        <>
          {trunc && (
            <div className="mb-4">
              <Hint kind="warn">
                文本过大（单侧 &gt;{MAX_LINES} 行），已截断对比：仅对比前 {MAX_LINES} 行，以下结果不完整。
              </Hint>
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Stat label="相同" value={stats.same} />
            <Stat label="新增" value={`+${stats.add}`} tone="good" />
            <Stat label="删除" value={`−${stats.del}`} tone="bad" />
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 font-mono text-xs overflow-auto max-h-[420px]">
            {lines.map((l, idx) => (
              <div key={idx} className={`px-2 py-0.5 whitespace-pre-wrap ${bg[l.type]}`}>
                <span className="select-none text-neutral-700 mr-2">{sign[l.type]}</span>
                {l.text || " "}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
