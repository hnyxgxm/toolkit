"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface JsonIssue {
  type: "error" | "warning" | "info";
  message: string;
  line?: number;
  suggestion?: string;
}

function analyzeJson(text: string): { output: string; issues: JsonIssue[]; stats: { keys: number; depth: number; size: string; arrays: number; objects: number } | null } {
  if (!text.trim()) return { output: "", issues: [], stats: null };

  const issues: JsonIssue[] = [];

  // 尝试解析
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    const lineMatch = msg.match(/position (\d+)/);
    let line: number | undefined;
    let suggestion: string | undefined;

    if (lineMatch) {
      const pos = parseInt(lineMatch[1]);
      line = text.substring(0, pos).split("\n").length;
    }

    // 常见错误诊断
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && !trimmed.endsWith("}") && !trimmed.endsWith("},")) {
      suggestion = "缺少闭合括号 }";
    } else if (trimmed.startsWith("[") && !trimmed.endsWith("]")) {
      suggestion = "缺少闭合方括号 ]";
    } else if (/,\s*[}\]]/.test(text)) {
      suggestion = "多余逗号：对象/数组最后一个元素后不应有逗号";
      line = text.substring(0, text.search(/,\s*[}\]]/)).split("\n").length;
    } else if (/"[^"]*"\s*"[^"]*"/.test(text) && !/:\s*"/.test(text)) {
      suggestion = "属性之间可能缺少逗号";
    } else if (/"[^"]*"\s*:/.test(text)) {
      // 检查是否是冒号问题
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^"[^"]*"\s*[^:,\s]/.test(l) && /"[^"]*"\s*:/.test(l)) {
          suggestion = `第 ${i + 1} 行：属性名和冒号之间不能有其他字符`;
          line = i + 1;
          break;
        }
      }
    }

    // 检查是否是中文引号
    if (text.includes("\u201c") || text.includes("\u201d") || text.includes("\u2018") || text.includes("\u2019")) {
      suggestion = "检测到中文引号，JSON 必须使用英文双引号";
    }

    // 检查是否是单引号
    if (text.includes("'") && !text.includes('"')) {
      suggestion = "JSON 必须使用双引号，不能使用单引号";
    }

    issues.push({
      type: "error",
      message: msg,
      line,
      suggestion,
    });

    return { output: "", issues, stats: null };
  }

  // 解析成功，做结构分析
  const stats = { keys: 0, depth: 0, size: "", arrays: 0, objects: 0 };
  const allKeys: string[] = [];
  const duplicateKeys: string[] = [];

  function walk(obj: unknown, depth: number) {
    if (depth > stats.depth) stats.depth = depth;
    if (Array.isArray(obj)) {
      stats.arrays++;
      obj.forEach((item) => walk(item, depth + 1));
    } else if (obj !== null && typeof obj === "object") {
      stats.objects++;
      const keys = Object.keys(obj);
      stats.keys += keys.length;
      keys.forEach((k) => {
        if (allKeys.includes(k)) {
          duplicateKeys.push(k);
        }
        allKeys.push(k);
        walk((obj as Record<string, unknown>)[k], depth + 1);
      });
    }
  }

  walk(parsed, 0);
  stats.size = new TextEncoder().encode(text).length < 1024
    ? `${new TextEncoder().encode(text).length} B`
    : `${(new TextEncoder().encode(text).length / 1024).toFixed(1)} KB`;

  // 智能建议
  if (duplicateKeys.length > 0) {
    issues.push({
      type: "warning",
      message: `检测到重复的 key：${[...new Set(duplicateKeys)].join("、")}`,
      suggestion: "重复的 key 在解析时只有最后一个会生效，建议删除重复项",
    });
  }

  if (stats.depth > 10) {
    issues.push({
      type: "warning",
      message: `嵌套层级过深（${stats.depth} 层）`,
      suggestion: "超过 10 层的嵌套会降低可读性，考虑扁平化数据结构",
    });
  }

  if (stats.keys > 100) {
    issues.push({
      type: "info",
      message: `包含 ${stats.keys} 个属性`,
      suggestion: "属性过多，考虑是否需要拆分为多个对象",
    });
  }

  // 检查值类型单一的数组
  if (Array.isArray(parsed) && parsed.length > 5) {
    const types = new Set(parsed.map((v) => typeof v));
    if (types.size === 1 && !types.has("object")) {
      issues.push({
        type: "info",
        message: `数组包含 ${parsed.length} 个相同类型的元素`,
        suggestion: `所有元素都是 ${[...types][0]} 类型`,
      });
    }
  }

  const output = JSON.stringify(parsed, null, 2);
  return { output, issues, stats };
}

export default function JsonPage() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState(2);
  const [mode, setMode] = useState<"format" | "minify">("format");

  const { output, issues, stats } = useMemo(() => analyzeJson(input), [input]);

  const minifyOutput = useMemo(() => {
    if (!input.trim()) return "";
    try {
      return JSON.stringify(JSON.parse(input));
    } catch {
      return "";
    }
  }, [input]);

  const displayOutput = mode === "format" ? output : minifyOutput;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const errors = issues.filter((i) => i.type === "error");
  const warnings = issues.filter((i) => i.type === "warning");
  const infos = issues.filter((i) => i.type === "info");

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
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-amber-400 border border-amber-500/20 bg-amber-500/10">
            解析
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">JSON 格式化</h1>
        </div>
        <p className="text-sm text-neutral-500 font-mono">格式化 · 压缩 · 校验 · 智能诊断</p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
          <button
            onClick={() => setMode("format")}
            className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
              mode === "format" ? "bg-white text-black" : "text-neutral-500 hover:text-white"
            }`}
          >
            格式化
          </button>
          <button
            onClick={() => setMode("minify")}
            className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
              mode === "minify" ? "bg-white text-black" : "text-neutral-500 hover:text-white"
            }`}
          >
            压缩
          </button>
        </div>

        {mode === "format" && (
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
            <span>缩进</span>
            {[2, 4].map((n) => (
              <button
                key={n}
                onClick={() => setIndent(n)}
                className={`px-2 py-1 rounded transition-all ${
                  indent === n ? "bg-white text-black" : "hover:bg-white/[0.05]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* 状态指示 */}
        {input.trim() && (
          <div className="flex items-center gap-2 text-xs font-mono">
            {errors.length > 0 ? (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                {errors.length} 个错误
              </span>
            ) : warnings.length > 0 ? (
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                {warnings.length} 个警告
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                格式正确
              </span>
            )}
          </div>
        )}
      </div>

      {/* 智能诊断面板 */}
      {issues.length > 0 && (
        <div className="mb-6 space-y-2">
          {errors.map((issue, i) => (
            <div key={i} className="p-3 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center text-[10px] text-red-400 flex-shrink-0">!</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-red-300 font-mono">
                    {issue.line && <span className="text-red-500 mr-2">L{issue.line}</span>}
                    {issue.message}
                  </div>
                  {issue.suggestion && (
                    <div className="text-xs text-red-400/70 mt-1 font-mono">
                      💡 {issue.suggestion}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {warnings.map((issue, i) => (
            <div key={i} className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 flex-shrink-0">⚠</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-amber-300 font-mono">{issue.message}</div>
                  {issue.suggestion && (
                    <div className="text-xs text-amber-400/70 mt-1 font-mono">
                      💡 {issue.suggestion}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {infos.map((issue, i) => (
            <div key={i} className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 flex-shrink-0">i</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-blue-300 font-mono">{issue.message}</div>
                  {issue.suggestion && (
                    <div className="text-xs text-blue-400/70 mt-1 font-mono">
                      💡 {issue.suggestion}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 统计信息 */}
      {stats && (
        <div className="mb-6 flex flex-wrap gap-3">
          {[
            { label: "属性", value: stats.keys },
            { label: "嵌套", value: `${stats.depth} 层` },
            { label: "对象", value: stats.objects },
            { label: "数组", value: stats.arrays },
            { label: "大小", value: stats.size },
          ].map((item) => (
            <div key={item.label} className="px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-xs font-mono">
              <span className="text-neutral-500">{item.label}</span>
              <span className="text-neutral-300 ml-1.5">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">输入</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"name": "hello", "version": 1}'
            className="w-full h-[480px] px-4 py-3 rounded-xl font-mono text-sm resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">输出</label>
            {displayOutput && (
              <button
                onClick={() => copyToClipboard(displayOutput)}
                className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors"
              >
                复制
              </button>
            )}
          </div>
          <div className="w-full h-[480px] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap text-neutral-300">
            {errors.length > 0 ? (
              <span className="text-neutral-600">修复错误后显示结果</span>
            ) : displayOutput ? (
              <span>{displayOutput}</span>
            ) : (
              <span className="text-neutral-600">格式化结果</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
