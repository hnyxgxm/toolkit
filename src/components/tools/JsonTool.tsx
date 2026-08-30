"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, CopyButton, Hint } from "@/components/ui";
import { analyzeJson, minifyJson } from "@/lib/json";

export default function JsonTool() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"format" | "minify">("format");
  const [indent, setIndent] = useState<2 | 4>(2);

  const analysis = useMemo(() => analyzeJson(input, indent), [input, indent]);
  const output = mode === "format" ? analysis.output : minifyJson(input);
  const hasError = input.trim() && !analysis.ok;

  return (
    <div>
      <PageHeader badge="解析" title="JSON 格式化" subtitle="格式化 · 压缩 · 校验 · 智能诊断" tone="amber" />

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Segmented value={mode} onChange={setMode} options={[{ value: "format", label: "格式化" }, { value: "minify", label: "压缩" }]} />
        {mode === "format" && (
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
            <span>缩进</span>
            <Segmented value={String(indent) as "2" | "4"} onChange={(v) => setIndent(Number(v) as 2 | 4)} options={[{ value: "2", label: "2" }, { value: "4", label: "4" }]} />
          </div>
        )}
        {analysis.ok && (
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            {[["属性", analysis.stats?.keys], ["嵌套", `${analysis.stats?.depth}层`], ["对象", analysis.stats?.objects], ["数组", analysis.stats?.arrays], ["大小", analysis.stats?.sizeLabel]].map(([k, v]) => (
              <span key={String(k)} className="px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-neutral-500">{k} <span className="text-neutral-300">{v}</span></span>
            ))}
          </div>
        )}
      </div>

      {analysis.issues.map((iss, i) => (
        <div key={i} className="mb-2">
          <Hint kind={iss.type === "error" ? "error" : iss.type === "warning" ? "warn" : "info"}>
            {iss.line && <span className="mr-2 opacity-70">第 {iss.line} 行：</span>}
            {iss.message}
            {iss.suggestion && <div className="opacity-70 mt-1">💡 {iss.suggestion}</div>}
          </Hint>
        </div>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">输入</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"name":"hello","version":1}' className="w-full h-[460px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">输出</label>
            <CopyButton text={output} />
          </div>
          <div className="w-full h-[460px] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap text-neutral-300">
            {hasError ? <span className="text-neutral-600">修复错误后显示结果</span> : output || <span className="text-neutral-600">结果将显示在这里</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
