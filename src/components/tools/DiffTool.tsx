"use client";

import { useMemo, useState } from "react";
import { PageHeader, Stat, Hint } from "@/components/ui";

type Line = { type: "same" | "add" | "del"; text: string; no?: number };

function diffLines(a: string[], b: string[]): Line[] {
  const n = a.length, m = b.length;
  // LCS DP
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Line[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i], no: ++j && i + 1 }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

const LIMIT = 2000;

export default function DiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const { lines, stats, tooBig } = useMemo(() => {
    const la = a.split("\n"), lb = b.split("\n");
    if (la.length > LIMIT || lb.length > LIMIT) return { lines: [] as Line[], stats: null, tooBig: true };
    const res = diffLines(la, lb);
    return {
      lines: res,
      tooBig: false,
      stats: {
        same: res.filter((l) => l.type === "same").length,
        add: res.filter((l) => l.type === "add").length,
        del: res.filter((l) => l.type === "del").length,
      },
    };
  }, [a, b]);

  const bg: Record<Line["type"], string> = {
    same: "text-neutral-500",
    add: "text-emerald-400 bg-emerald-500/[0.06]",
    del: "text-red-400 bg-red-500/[0.06]",
  };
  const sign: Record<Line["type"], string> = { same: " ", add: "+", del: "-" };

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

      {tooBig ? (
        <Hint kind="warn">输入行数过大（&gt;{LIMIT} 行），请缩减后对比以保持流畅。</Hint>
      ) : !a && !b ? (
        <Hint kind="info">在上方输入两段文本，实时查看差异。</Hint>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Stat label="相同" value={stats!.same} />
            <Stat label="新增" value={`+${stats!.add}`} tone="good" />
            <Stat label="删除" value={`−${stats!.del}`} tone="bad" />
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
