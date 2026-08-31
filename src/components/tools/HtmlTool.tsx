"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, CopyButton, Hint, Toggle, downloadFile } from "@/components/ui";
import {
  escapeHtmlEntities,
  unescapeHtmlEntities,
  type EntityStyle,
} from "@/lib/htmlentity";

/* ---------- 页脚隐私声明 ---------- */

function LocalFooter() {
  return (
    <div className="mt-10 pt-4 border-t border-white/[0.06] flex items-center justify-center gap-1.5 text-xs font-mono text-neutral-600">
      <span aria-hidden="true">🔒</span>
      <span>全部本地运算 · 数据不上传服务器</span>
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-mono px-2.5 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
    >
      清空
    </button>
  );
}

const STYLE_OPTIONS: Array<{ value: EntityStyle; label: string }> = [
  { value: "named", label: "命名实体" },
  { value: "dec", label: "十进制" },
  { value: "hex", label: "十六进制" },
];

export default function HtmlTool() {
  const [rawInput, setRawInput] = useState("");
  const [entityInput, setEntityInput] = useState("");
  const [style, setStyle] = useState<EntityStyle>("named");
  const [full, setFull] = useState(false);
  const [tolerant, setTolerant] = useState(false);

  /** 左栏：原文 → 实体（即输即算） */
  const escaped = useMemo(
    () => escapeHtmlEntities(rawInput, { style, full }),
    [rawInput, style, full]
  );
  /** 左栏输出的实体个数（原文本就含有实体时会一并转义，计数即为转义处数） */
  const escapeCount = useMemo(() => escaped.match(/&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g)?.length ?? 0, [escaped]);

  /** 右栏：实体 → 原文（即输即算） */
  const unescaped = useMemo(() => unescapeHtmlEntities(entityInput, { tolerant }), [entityInput, tolerant]);

  return (
    <div>
      <PageHeader badge="转换" title="HTML 转义" subtitle="双向双栏 · 即输即算 · 命名 / 数字实体 · 未闭合容错" tone="violet" />

      {/* 选项条 */}
      <div className="flex items-center gap-5 mb-6 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
          <span>风格</span>
          <Segmented value={style} onChange={setStyle} options={STYLE_OPTIONS} ariaLabel="实体风格" />
        </div>
        <div className={style === "named" ? "" : "opacity-40"}>
          <Toggle checked={full} onChange={setFull} label="全量命名实体" hint={style === "named" ? "nbsp / copy / mdash 等约 70 个" : "仅命名风格有效"} />
        </div>
        <Toggle checked={tolerant} onChange={setTolerant} label="未闭合容错" hint="缺分号的实体也强制解码" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左栏：转义 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
              原文 → 实体{escapeCount > 0 && <span className="text-neutral-700 normal-case"> · {escapeCount} 处</span>}
            </label>
            {rawInput && <ClearButton onClick={() => setRawInput("")} />}
          </div>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder='<div class="a">b & c</div>'
            className="w-full h-[max(360px,calc(100vh_-_380px))] px-4 py-3 rounded-xl font-mono text-[15px] resize-y"
            spellCheck={false}
          />
          <div className="flex items-center justify-between mt-4 mb-2">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">转义结果</span>
            <div className="flex items-center gap-1">
              {escaped && (
                <>
                  <button
                    onClick={() => setEntityInput(escaped)}
                    title="把转义结果填到右栏进行反转义"
                    className="text-xs font-mono px-2.5 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    填入右栏 →
                  </button>
                  <CopyButton text={escaped} />
                  <button
                    onClick={() => downloadFile("escaped.txt", escaped, "text/plain;charset=utf-8")}
                    title="下载转义结果（.txt）"
                    className="text-xs font-mono px-2.5 py-1 rounded-md text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-colors"
                  >
                    导出 .txt
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="w-full h-[max(360px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap break-all text-neutral-300">
            {escaped || <span className="text-neutral-600">转义结果实时显示在这里</span>}
          </div>
        </div>

        {/* 右栏：反转义 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">实体 → 原文</label>
            {entityInput && <ClearButton onClick={() => setEntityInput("")} />}
          </div>
          <textarea
            value={entityInput}
            onChange={(e) => setEntityInput(e.target.value)}
            placeholder="&lt;div&gt;&amp;&lt;/div&gt;"
            className="w-full h-[max(360px,calc(100vh_-_380px))] px-4 py-3 rounded-xl font-mono text-[15px] resize-y"
            spellCheck={false}
          />
          <div className="flex items-center justify-between mt-4 mb-2">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">反转义结果</span>
            <div className="flex items-center gap-1">
              {unescaped.text && (
                <>
                  <button
                    onClick={() => setRawInput(unescaped.text)}
                    title="把反转义结果填到左栏进行转义"
                    className="text-xs font-mono px-2.5 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    ← 填入左栏
                  </button>
                  <CopyButton text={unescaped.text} />
                  <button
                    onClick={() => downloadFile("unescaped.html", unescaped.text, "text/html;charset=utf-8")}
                    title="下载反转义结果（.html）"
                    className="text-xs font-mono px-2.5 py-1 rounded-md text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-colors"
                  >
                    导出 .html
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="w-full h-[max(360px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap break-all text-neutral-300">
            {unescaped.text || <span className="text-neutral-600">反转义结果实时显示在这里</span>}
          </div>
        </div>
      </div>

      {/* 未闭合实体提示 */}
      {!tolerant && unescaped.unclosed.length > 0 && (
        <div className="mt-4">
          <Hint kind="warn">
            检测到 {unescaped.unclosed.length} 处未闭合实体（缺分号），已保持原样：
            <span className="mx-1 font-mono">
              {unescaped.unclosed.slice(0, 5).map((u) => `「${u.entity}」@${u.offset}`).join("、")}
              {unescaped.unclosed.length > 5 && " …"}
            </span>
            。如需强制解码，可开启右上角「未闭合容错」。
          </Hint>
        </div>
      )}
      {tolerant && unescaped.unclosed.length > 0 && (
        <div className="mt-4">
          <Hint kind="info">已按容错模式解码 {unescaped.unclosed.length} 处未闭合实体（缺分号），请注意核对结果。</Hint>
        </div>
      )}

      <LocalFooter />
    </div>
  );
}
