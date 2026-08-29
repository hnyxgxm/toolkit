"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface HtmlIssue {
  type: "warning" | "info";
  message: string;
  suggestion?: string;
}

const htmlEntities: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&copy;": "©", "&reg;": "®", "&trade;": "™",
  "&times;": "×", "&divide;": "÷", "&plusmn;": "±", "&micro;": "μ",
  "&para;": "¶", "&sect;": "§", "&deg;": "°", "&hellip;": "…",
  "&mdash;": "—", "&ndash;": "–", "&laquo;": "«", "&raquo;": "»",
};

function unescapeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&[a-zA-Z]+;/g, (entity) => htmlEntities[entity] || entity);
}

function analyzeHtml(text: string): { output: string; issues: HtmlIssue[]; stats: { entities: number; tags: number; chars: number } | null } {
  if (!text) return { output: "", issues: [], stats: null };

  const issues: HtmlIssue[] = [];
  const decoded = unescapeHtml(text);

  // 统计
  const entityMatches = text.match(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g);
  const entities = entityMatches ? entityMatches.length : 0;
  const tagMatches = decoded.match(/<[^>]+>/g);
  const tags = tagMatches ? tagMatches.length : 0;

  // 检查未识别的实体
  const unknownEntities = text.match(/&[a-zA-Z]+;/g);
  if (unknownEntities) {
    const unique = [...new Set(unknownEntities)];
    const known = unique.filter((e) => e in htmlEntities);
    const unknown = unique.filter((e) => !(e in htmlEntities));
    if (unknown.length > 0) {
      issues.push({
        type: "warning",
        message: `未识别的 HTML 实体：${unknown.slice(0, 5).join("、")}${unknown.length > 5 ? ` 等 ${unknown.length} 个` : ""}`,
        suggestion: "这些实体可能不是标准 HTML 实体，解码后会原样保留",
      });
    }
    if (known.length > 0) {
      issues.push({
        type: "info",
        message: `检测到 ${known.length} 个标准实体`,
      });
    }
  }

  // 检查混合编码
  if (text.includes("&") && text.includes("<") && !text.includes("&lt;")) {
    issues.push({
      type: "warning",
      message: "检测到原始 HTML 标签与实体混合",
      suggestion: "如果这是 HTML 源码，建议全部使用实体编码；如果是纯文本，不应包含 < > 标签",
    });
  }

  // 检查中文引号
  if (text.includes("\u201c") || text.includes("\u201d")) {
    issues.push({
      type: "info",
      message: "检测到中文引号",
      suggestion: "HTML 中应使用实体 &ldquo; 和 &rdquo; 或直接使用英文引号",
    });
  }

  // 检查可能的转义遗漏
  if (/<script/i.test(decoded)) {
    issues.push({
      type: "warning",
      message: "解码后包含 <script> 标签",
      suggestion: "如果这是用户输入，可能存在 XSS 风险",
    });
  }

  return { output: decoded, issues, stats: { entities, tags, chars: decoded.length } };
}

export default function HtmlPage() {
  const [input, setInput] = useState("");

  const { output, issues, stats } = useMemo(() => analyzeHtml(input), [input]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

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
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-purple-400 border border-purple-500/20 bg-purple-500/10">
            解码
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">HTML 反转义</h1>
        </div>
        <p className="text-sm text-neutral-500 font-mono">将 HTML 实体编码还原为原始文本</p>
      </div>

      {/* 诊断面板 */}
      {issues.length > 0 && (
        <div className="mb-6 space-y-2">
          {issues.map((issue, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border ${
                issue.type === "warning"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-blue-500/20 bg-blue-500/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
                  issue.type === "warning"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}>
                  {issue.type === "warning" ? "⚠" : "i"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-mono ${
                    issue.type === "warning" ? "text-amber-300" : "text-blue-300"
                  }`}>
                    {issue.message}
                  </div>
                  {issue.suggestion && (
                    <div className={`text-xs mt-1 font-mono ${
                      issue.type === "warning" ? "text-amber-400/70" : "text-blue-400/70"
                    }`}>
                      💡 {issue.suggestion}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 统计 */}
      {stats && (
        <div className="mb-6 flex flex-wrap gap-3">
          {[
            { label: "字符", value: stats.chars },
            { label: "实体", value: stats.entities },
            { label: "标签", value: stats.tags },
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
            placeholder={'例如：&lt;p&gt;Hello &amp; World&lt;/p&gt;'}
            className="w-full h-64 px-4 py-3 rounded-xl font-mono text-sm resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">输出</label>
            {output && (
              <button
                onClick={() => copyToClipboard(output)}
                className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors"
              >
                复制
              </button>
            )}
          </div>
          <div className="w-full h-64 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap text-neutral-300">
            {output || <span className="text-neutral-600">解码结果</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
