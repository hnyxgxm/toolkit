"use client";

import { useMemo, useState } from "react";
import { PageHeader, CopyButton } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";

const SAMPLE = `# 标题

这是 **加粗** 和 *斜体*，还有 \`行内代码\`。

- 列表项 A
- 列表项 B

> 引用块

\`\`\`
代码块
const x = 1;
\`\`\`

[链接](https://example.com)
`;

export default function MarkdownTool() {
  const [input, setInput] = useState(SAMPLE);
  const html = useMemo(() => renderMarkdown(input), [input]);

  return (
    <div>
      <PageHeader badge="转换" title="Markdown 预览" subtitle="实时渲染 · 本地安全转义" tone="blue" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">Markdown</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} className="w-full h-[520px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">预览</label>
            <CopyButton text={html} label="复制 HTML" />
          </div>
          <div className="w-full h-[520px] px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto text-sm text-neutral-300" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
