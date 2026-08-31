"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, CopyButton } from "@/components/ui";
import { renderMarkdown, extractOutline, applyMdAction, type MdAction } from "@/lib/markdown";

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

/* ---------- 草稿（localStorage 自动保存） ---------- */

const DRAFT_KEY = "toolkit-markdown-draft-v1";

function relTime(at: number): string {
  if (!at) return "刚刚";
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 45) return "刚刚";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/* ---------- 工具栏 ---------- */

const TOOLS: Array<{ act: MdAction; label: string; title: string; cls?: string }> = [
  { act: "h1", label: "H1", title: "一级标题" },
  { act: "h2", label: "H2", title: "二级标题" },
  { act: "h3", label: "H3", title: "三级标题" },
  { act: "bold", label: "B", title: "加粗（Ctrl+B）", cls: "font-bold" },
  { act: "italic", label: "I", title: "斜体（Ctrl+I）", cls: "italic" },
  { act: "ul", label: "列表", title: "无序列表" },
  { act: "ol", label: "编号", title: "有序列表" },
  { act: "quote", label: "引用", title: "引用块" },
  { act: "table", label: "表格", title: "插入表格" },
  { act: "code", label: "代码", title: "行内代码" },
  { act: "link", label: "链接", title: "插入链接" },
];

export default function MarkdownTool() {
  const [input, setInput] = useState(SAMPLE);
  const [tocOpen, setTocOpen] = useState(true);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{ text: string; at: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const pvRef = useRef<HTMLDivElement | null>(null);
  const lhRef = useRef(20); // textarea 行高（挂载后实测）
  const eRaf = useRef(0);
  const pRaf = useRef(0);
  const firstRun = useRef(true);
  // 滚动同步互斥锁：程序化滚动后短暂屏蔽反向同步，避免抖动循环
  const syncLock = useRef<{ by: "e" | "p" | null; until: number }>({ by: null, until: 0 });

  const html = useMemo(() => renderMarkdown(input), [input]);
  const outline = useMemo(() => extractOutline(input), [input]);
  const fileName = useMemo(() => safeFileName(exportTitle(input)), [input]);
  const docHtml = useMemo(() => buildStandaloneHtml(exportTitle(input), html), [input, html]);

  /* 草稿：挂载时读取，发现非默认内容的本地草稿则提示恢复 */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { text?: unknown; at?: unknown };
      if (typeof d.text === "string" && d.text && d.text !== SAMPLE) {
        setPendingDraft({ text: d.text, at: typeof d.at === "number" ? d.at : 0 });
      }
    } catch {
      /* localStorage 不可用（隐私模式等）→ 静默跳过 */
    }
  }, []);

  /* 草稿：输入 800ms 防抖自动保存（跳过挂载首帧，避免覆盖未确认草稿） */
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: input, at: Date.now() }));
        setLastSaved(Date.now());
      } catch {
        /* 忽略写入失败 */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [input]);

  /* 行高实测（滚动同步按行号换算） */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const v = parseFloat(window.getComputedStyle(ta).lineHeight);
    if (Number.isFinite(v) && v > 0) lhRef.current = v;
  }, []);

  /* ---------- 编辑动作 ---------- */

  const apply = useCallback((action: MdAction) => {
    const ta = taRef.current;
    if (!ta) return;
    const r = applyMdAction(ta.value, ta.selectionStart, ta.selectionEnd, action);
    setInput(r.text);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.selStart, r.selEnd);
    });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        apply("bold");
      } else if (k === "i") {
        e.preventDefault();
        apply("italic");
      }
    }
  };

  /* ---------- 草稿恢复 / 丢弃 ---------- */

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setInput(pendingDraft.text);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 忽略 */
    }
    setPendingDraft(null);
  }, []);

  /* ---------- 大纲跳转 + 滚动同步（按标题锚点近似同步） ---------- */

  const jumpTo = useCallback((id: string) => {
    const pv = pvRef.current;
    if (!pv) return;
    const el = pv.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    setActiveHeading(id);
    syncLock.current = { by: "p", until: Date.now() + 300 };
    pv.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "smooth" });
  }, []);

  const onEditorScroll = useCallback(() => {
    if (syncLock.current.by === "p" && Date.now() < syncLock.current.until) return;
    if (eRaf.current) return;
    eRaf.current = requestAnimationFrame(() => {
      eRaf.current = 0;
      const ta = taRef.current;
      const pv = pvRef.current;
      if (!ta || !pv || outline.length === 0) return;
      syncLock.current = { by: "e", until: Date.now() + 150 };
      const firstLine = Math.max(0, Math.floor(ta.scrollTop / lhRef.current));
      let target = outline[0];
      for (const it of outline) {
        if (it.line <= firstLine + 1) target = it;
        else break;
      }
      const el = pv.querySelector<HTMLElement>(`#${target.id}`);
      if (el) pv.scrollTop = Math.max(0, el.offsetTop - 8);
    });
  }, [outline]);

  const onPreviewScroll = useCallback(() => {
    if (syncLock.current.by === "e" && Date.now() < syncLock.current.until) return;
    if (pRaf.current) return;
    pRaf.current = requestAnimationFrame(() => {
      pRaf.current = 0;
      const ta = taRef.current;
      const pv = pvRef.current;
      if (!ta || !pv) return;
      syncLock.current = { by: "p", until: Date.now() + 150 };
      const top = pv.scrollTop + 32;
      let active: string | null = outline.length > 0 ? outline[0].id : null;
      for (const it of outline) {
        const el = pv.querySelector<HTMLElement>(`#${it.id}`);
        if (el && el.offsetTop <= top) active = it.id;
        else break;
      }
      setActiveHeading(active);
      const it = outline.find((o) => o.id === active);
      ta.scrollTop = it ? Math.max(0, it.line * lhRef.current - 12) : 0;
    });
  }, [outline]);

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
      <PageHeader
        badge="转换"
        title="Markdown 预览"
        subtitle="实时渲染 · 本地安全转义 · 表格 / 任务列表 / 脚注 · 大纲目录 · 自动存草稿"
        tone="blue"
      />

      {pendingDraft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-sm text-amber-300">
          <span>检测到未保存的本地草稿（{relTime(pendingDraft.at)}保存于浏览器）</span>
          <button
            onClick={restoreDraft}
            className="text-xs font-mono px-2.5 py-1 rounded-md text-amber-200 bg-amber-500/15 hover:bg-amber-500/25"
          >
            恢复草稿
          </button>
          <button
            onClick={discardDraft}
            className="text-xs font-mono px-2.5 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06]"
          >
            丢弃
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* 大纲目录面板 */}
        <aside className={`w-52 shrink-0 ${tocOpen ? "hidden lg:block" : "hidden"}`}>
          <div className="lg:sticky lg:top-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">大纲目录</span>
              <button onClick={() => setTocOpen(false)} className="text-[10px] font-mono text-neutral-600 hover:text-white" title="收起目录">
                收起
              </button>
            </div>
            <nav aria-label="文档大纲" className="max-h-[500px] overflow-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              {outline.length === 0 ? (
                <p className="text-xs text-neutral-600 px-2 py-2 font-mono">（暂无标题）</p>
              ) : (
                outline.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => jumpTo(it.id)}
                    title={it.text}
                    className={`block w-full text-left text-xs rounded-md px-2 py-1 truncate transition-colors ${
                      activeHeading === it.id ? "text-blue-300 bg-blue-500/10" : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                    }`}
                    style={{ paddingLeft: 8 + (it.level - 1) * 10 }}
                  >
                    <span className="text-[10px] font-mono text-neutral-600 mr-1">H{it.level}</span>
                    {it.text}
                  </button>
                ))
              )}
            </nav>
          </div>
        </aside>

        {/* 编辑列 */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <div className="flex items-center gap-1 flex-wrap">
              {TOOLS.map((t) => (
                <button
                  key={t.act}
                  onClick={() => apply(t.act)}
                  title={t.title}
                  className={`px-2 py-1 rounded-md text-xs font-mono border border-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/[0.06] ${t.cls ?? ""}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setTocOpen((v) => !v)}
              className="text-xs font-mono px-2.5 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05]"
              title="显示/隐藏大纲目录"
            >
              {tocOpen ? "隐藏目录" : "大纲目录"}
            </button>
          </div>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={onEditorScroll}
            className="w-full h-[520px] px-4 py-3 rounded-xl font-mono text-[15px] resize-y"
            spellCheck={false}
            placeholder="输入 Markdown…（Ctrl+B 加粗 / Ctrl+I 斜体）"
          />
        </div>

        {/* 预览列 */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">预览</label>
              {lastSaved !== null && (
                <span className="text-[10px] font-mono text-neutral-600" title="草稿自动保存于浏览器本地">
                  已自动保存 {new Date(lastSaved).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
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
          <div
            ref={pvRef}
            onScroll={onPreviewScroll}
            className="relative w-full h-[520px] px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto text-sm text-neutral-300"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-neutral-600 font-mono select-none">🔒 全部本地运算 · 文本不上传服务器</p>
    </div>
  );
}
