"use client";

import { useCallback, useMemo, useState } from "react";
import { PageHeader, CopyButton } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";

const SAMPLE = `# 项目周报

这是 **加粗** 和 *斜体*，还有 \`行内代码\` 与 ~~删除线~~。

## 本周任务

- [x] 实时预览渲染
- [x] GFM 表格支持
- [ ] 导出独立 HTML

## 进度表

| 模块 | 语法示例 | 状态 |
| :--- | :---: | ---: |
| 表格 | 冒号定对齐 | 已完成 |
| 任务列表 | - [x] | 已完成 |
| 脚注 | 见文末 | 已完成 |

> 引用块：所有渲染都在本地完成，输入内容不会上传。

\`\`\`
代码块
const x = 1; // 这里 | 不是表格 |
\`\`\`

自动链接：https://example.com

渲染细节见脚注[^note]。

[^note]: 脚注内容汇总在文档末尾，点击编号可跳回正文。

[了解更多](https://example.com)
`;

/* ---------- 导出独立 HTML（纯前端，无解析逻辑） ---------- */

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 文件名标题：取首个标题行，否则回退 markdown */
function exportTitle(src: string): string {
  for (const raw of src.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const h = t.match(/^#{1,6}\s+(.+)$/);
    if (h) return h[1].trim();
    break;
  }
  return "markdown";
}

function safeFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim().slice(0, 80).trim();
  return base ? `${base}.html` : "markdown.html";
}

/** 独立可打开的 HTML 文档：utf-8 + 最小内联样式 + 渲染后的正文 */
function buildStandaloneHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeText(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0a; color: #d4d4d4; font-family: ui-sans-serif, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 15px; line-height: 1.7; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 24px 64px; }
  h1, h2, h3, h4, h5, h6 { color: #fff; font-weight: 700; line-height: 1.3; margin: 1.5em 0 0.6em; }
  h1 { font-size: 1.7em; margin-top: 0; }
  h2 { font-size: 1.4em; }
  h3 { font-size: 1.2em; }
  p { margin: 0.8em 0; }
  a { color: #60a5fa; text-decoration: underline; }
  ul, ol { padding-left: 1.6em; margin: 0.8em 0; }
  li { margin: 0.25em 0; }
  li.list-none { list-style: none; }
  blockquote { border-left: 2px solid rgba(96, 165, 250, 0.5); padding-left: 1em; margin: 0.8em 0; color: #a3a3a3; }
  pre { background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 1em; overflow: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
  pre code { background: transparent; color: inherit; padding: 0; }
  p code, li code, td code, th code, h1 code, h2 code, h3 code { background: rgba(255, 255, 255, 0.1); color: #fda4af; border-radius: 4px; padding: 0.15em 0.45em; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.92em; }
  th, td { padding: 0.5em 0.75em; }
  th { border-bottom: 1px solid rgba(255, 255, 255, 0.1); color: #fff; font-weight: 600; }
  td { border-top: 1px solid rgba(255, 255, 255, 0.06); }
  hr { border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 1.6em 0; }
  del { color: #737373; }
  input[type="checkbox"] { accent-color: #3b82f6; vertical-align: -0.1em; margin-right: 0.4em; }
  sup a { text-decoration: none; }
  section ol li { color: #a3a3a3; }
  /* 沿用渲染器输出的对齐类，保证表格对齐不丢失 */
  .text-left { text-align: left; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
</style>
</head>
<body>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}

export default function MarkdownTool() {
  const [input, setInput] = useState(SAMPLE);
  const html = useMemo(() => renderMarkdown(input), [input]);
  const fileName = useMemo(() => safeFileName(exportTitle(input)), [input]);
  const docHtml = useMemo(() => buildStandaloneHtml(exportTitle(input), html), [input, html]);

  const onExport = useCallback(() => {
    const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [docHtml, fileName]);

  return (
    <div>
      <PageHeader badge="转换" title="Markdown 预览" subtitle="实时渲染 · 本地安全转义 · 支持表格 / 任务列表 / 脚注" tone="blue" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">Markdown</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} className="w-full h-[520px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">预览</label>
            <div className="flex items-center gap-1">
              <CopyButton text={html} label="复制 HTML" />
              <button
                onClick={onExport}
                title={`导出独立文件：${fileName}`}
                className="text-xs font-mono px-2.5 py-1 rounded-md transition-colors text-blue-400 hover:text-blue-300 hover:bg-white/[0.05]"
              >
                导出 HTML
              </button>
            </div>
          </div>
          <div className="w-full h-[520px] px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto text-sm text-neutral-300" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
