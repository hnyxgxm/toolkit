"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, CopyButton } from "@/components/ui";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const UNESC = new Map(Object.entries(ESC).map(([k, v]) => [v, k]));

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}
function unescapeHtml(s: string): string {
  return s
    .replace(/&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (m) => {
      if (UNESC.has(m)) return UNESC.get(m)!;
      if (m.startsWith("&#x")) return String.fromCodePoint(parseInt(m.slice(3, -1), 16));
      if (m.startsWith("&#")) return String.fromCodePoint(parseInt(m.slice(2, -1), 10));
      return m;
    });
}

export default function HtmlTool() {
  const [mode, setMode] = useState<"escape" | "unescape">("escape");
  const [input, setInput] = useState("");
  const output = useMemo(() => (mode === "escape" ? escapeHtml(input) : unescapeHtml(input)), [input, mode]);
  const changedCount = useMemo(() => (input ? (input.match(/[&<>"']/g) || []).length : 0), [input]);

  return (
    <div>
      <PageHeader badge="转换" title="HTML 转义" subtitle="实体编码 / 解码 · 支持数字实体" tone="violet" />
      <div className="mb-6">
        <Segmented value={mode} onChange={setMode} options={[{ value: "escape", label: "转义" }, { value: "unescape", label: "反转义" }]} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">输入</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "escape" ? '<div class="a">b & c</div>' : "&lt;div&gt;&amp;&lt;/div&gt;"} className="w-full h-[420px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">输出 {changedCount > 0 && <span className="text-neutral-700 normal-case">· {changedCount} 处实体</span>}</label>
            <CopyButton text={output} />
          </div>
          <div className="w-full h-[420px] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap break-all text-neutral-300">
            {output || <span className="text-neutral-600">结果显示在这里</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
