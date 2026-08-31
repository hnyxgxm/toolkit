"use client";

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { PageHeader, Segmented, Toggle, Hint } from "@/components/ui";
import {
  diffTextWithOptions,
  toUnifiedDiff,
  wordDiff,
  MAX_LINES,
  type DiffLine,
  type DiffOptions,
  type WordSeg,
} from "@/lib/diff";

type ViewMode = "split" | "unified";

interface DiffCell {
  no: number;
  text: string;
  /** 词级高亮分段（null = 不做行内二次高亮） */
  hl: WordSeg[] | null;
}

interface DiffRow {
  kind: "same" | "del" | "add" | "pair";
  left: DiffCell | null;
  right: DiffCell | null;
  /** 差异块序号（锚点导航用；-1 = 相同行） */
  hunk: number;
}

/** 差异结果渲染行数上限（引擎已截断输入行数；此处保护 DOM 规模，完整结果可下载 .diff） */
const MAX_RENDER_ROWS = 20_000;

/** 把行级 diff 序列组装为双栏行：连续 del+add 块按序成对，做词级二次 diff。 */
function buildRows(lines: DiffLine[]): { rows: DiffRow[]; pairs: number } {
  const rows: DiffRow[] = [];
  let pairs = 0;
  let hunk = -1;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.type === "same") {
      rows.push({
        kind: "same",
        left: { no: l.aIdx ?? 0, text: l.text, hl: null },
        right: { no: l.bIdx ?? 0, text: l.text, hl: null },
        hunk: -1,
      });
      i++;
      continue;
    }
    hunk++;
    if (l.type === "add") {
      while (i < lines.length && lines[i].type === "add") {
        const ad = lines[i++];
        rows.push({ kind: "add", left: null, right: { no: ad.bIdx ?? 0, text: ad.text, hl: null }, hunk });
      }
      continue;
    }
    const dels: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "del") dels.push(lines[i++]);
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "add") adds.push(lines[i++]);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const d = dels[k];
      const ad = adds[k];
      let hlOld: WordSeg[] | null = null;
      let hlNew: WordSeg[] | null = null;
      if (d && ad) {
        pairs++;
        const wd = wordDiff(d.text, ad.text);
        if (wd) {
          if (wd.old.some((s) => s.changed)) hlOld = wd.old;
          if (wd.new.some((s) => s.changed)) hlNew = wd.new;
        }
      }
      rows.push({
        kind: d && ad ? "pair" : d ? "del" : "add",
        left: d ? { no: d.aIdx ?? 0, text: d.text, hl: hlOld } : null,
        right: ad ? { no: ad.bIdx ?? 0, text: ad.text, hl: hlNew } : null,
        hunk,
      });
    }
  }
  return { rows, pairs };
}

interface URow {
  type: "same" | "add" | "del";
  aNo?: number;
  bNo?: number;
  text: string;
  hl: WordSeg[] | null;
  hunk: number;
}

function buildUnifiedRows(rows: DiffRow[]): URow[] {
  const out: URow[] = [];
  for (const r of rows) {
    if (r.kind === "same") {
      out.push({ type: "same", aNo: r.left!.no, bNo: r.right!.no, text: r.left!.text, hl: null, hunk: -1 });
    } else if (r.kind === "pair") {
      out.push({ type: "del", aNo: r.left!.no, text: r.left!.text, hl: r.left!.hl, hunk: r.hunk });
      out.push({ type: "add", bNo: r.right!.no, text: r.right!.text, hl: r.right!.hl, hunk: r.hunk });
    } else if (r.kind === "del") {
      out.push({ type: "del", aNo: r.left!.no, text: r.left!.text, hl: null, hunk: r.hunk });
    } else {
      out.push({ type: "add", bNo: r.right!.no, text: r.right!.text, hl: null, hunk: r.hunk });
    }
  }
  return out;
}

/** 行内容渲染：有词级分段时只给差异 token 上色，否则整行纯文本。 */
function LineText({ text, hl, side }: { text: string; hl: WordSeg[] | null; side: "del" | "add" }) {
  if (!hl) return <>{text || " "}</>;
  return (
    <>
      {hl.map((s, i) =>
        s.changed ? (
          <span
            key={i}
            className={side === "del" ? "rounded-sm bg-red-500/25 text-red-200" : "rounded-sm bg-emerald-500/25 text-emerald-200"}
          >
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

const NO_CLS = "select-none w-10 shrink-0 text-right pr-2 text-neutral-600 tabular-nums";

export default function DiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [view, setView] = useState<ViewMode>("split");
  const [ignore, setIgnore] = useState<DiffOptions>({
    ignoreCase: false,
    ignoreTrailingWs: false,
    ignoreBlankLines: false,
  });
  const [hunkCur, setHunkCur] = useState(0);

  const da = useDeferredValue(a);
  const db = useDeferredValue(b);

  const { lines, stats, trunc } = useMemo(() => diffTextWithOptions(da, db, ignore), [da, db, ignore]);
  const { rows, pairs } = useMemo(() => buildRows(lines), [lines]);
  const urows = useMemo(() => buildUnifiedRows(rows), [rows]);
  const hunkTotal = useMemo(() => rows.reduce((m, r) => Math.max(m, r.hunk + 1), 0), [rows]);
  const hasDiff = stats.add + stats.del > 0;
  const tooManyRows = rows.length > MAX_RENDER_ROWS;
  const shown = tooManyRows ? rows.slice(0, MAX_RENDER_ROWS) : rows;
  const shownU = tooManyRows ? urows.slice(0, MAX_RENDER_ROWS) : urows;

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const jumpHunk = useCallback(
    (dir: 1 | -1) => {
      if (hunkTotal === 0) return;
      const next = (hunkCur + dir + hunkTotal) % hunkTotal;
      setHunkCur(next);
      const sc = scrollerRef.current;
      if (!sc) return;
      const el = sc.querySelector<HTMLElement>(`[data-hunk="${next}"]`);
      if (el) sc.scrollTop = Math.max(0, el.offsetTop - 6);
    },
    [hunkCur, hunkTotal],
  );

  const onSwap = useCallback(() => {
    setA(b);
    setB(a);
    setHunkCur(0);
  }, [a, b]);

  const onDownload = useCallback(() => {
    const text = toUnifiedDiff(a, b, ignore);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = "diff.diff";
    document.body.appendChild(el);
    el.click();
    el.remove();
    URL.revokeObjectURL(url);
  }, [a, b, ignore]);

  const setIgnoreKey = (k: keyof DiffOptions) => (v: boolean) => {
    setIgnore((s) => ({ ...s, [k]: v }));
    setHunkCur(0);
  };

  const badge = "px-2 py-1 rounded-md font-mono text-xs border tabular-nums";

  return (
    <div>
      <PageHeader
        badge="对比"
        title="文本对比 Diff"
        subtitle="逐行 Myers/LCS 差异 · 并排/统一视图 · 词级行内高亮 · 忽略选项"
        tone="blue"
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 mb-5">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">原始 A</label>
          <textarea
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="w-full h-[max(380px,calc(100vh_-_400px))] px-4 py-3 rounded-xl font-mono text-[15px] resize-y"
            spellCheck={false}
            placeholder="粘贴原始文本…"
          />
        </div>
        <div className="flex md:flex-col items-center justify-center pt-6 md:pt-8">
          <button
            onClick={onSwap}
            title="交换 A / B"
            aria-label="交换 A 与 B"
            className="w-9 h-9 rounded-lg border border-white/[0.08] text-neutral-400 hover:text-white hover:bg-white/[0.06] text-base"
          >
            ⇄
          </button>
        </div>
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">对比 B</label>
          <textarea
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="w-full h-[max(380px,calc(100vh_-_400px))] px-4 py-3 rounded-xl font-mono text-[15px] resize-y"
            spellCheck={false}
            placeholder="粘贴对比文本…"
          />
        </div>
      </div>

      {!a && !b ? (
        <Hint kind="info">在上方输入两段文本，实时查看差异；支持并排/统一视图、忽略选项与差异块跳转，可下载 .diff 文件。</Hint>
      ) : (
        <>
          {trunc && (
            <div className="mb-4">
              <Hint kind="warn">文本过大（单侧 &gt;{MAX_LINES} 行），已截断对比：仅对比前 {MAX_LINES} 行，以下结果不完整。</Hint>
            </div>
          )}

          {/* 工具条：视图切换 / 统计徽章 / 差异块导航 / 下载 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-3">
            <Segmented<ViewMode>
              value={view}
              onChange={(v) => {
                setView(v);
                setHunkCur(0);
              }}
              options={[
                { value: "split", label: "并排" },
                { value: "unified", label: "统一" },
              ]}
              ariaLabel="视图切换"
            />
            <div className="flex items-center gap-2">
              <span className={`${badge} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>+{stats.add} 新增</span>
              <span className={`${badge} bg-red-500/10 text-red-400 border-red-500/20`}>−{stats.del} 删除</span>
              {pairs > 0 && <span className={`${badge} bg-amber-500/10 text-amber-400 border-amber-500/20`}>±{pairs} 修改</span>}
            </div>
            {hunkTotal > 0 && (
              <div className="flex items-center gap-1.5 font-mono text-xs text-neutral-400">
                <button
                  onClick={() => jumpHunk(-1)}
                  className="px-2 py-1 rounded-md border border-white/[0.08] hover:text-white hover:bg-white/[0.06]"
                  title="上一个差异块"
                >
                  ‹ 上一处
                </button>
                <span className="tabular-nums text-neutral-500 px-1">
                  {hunkCur + 1}/{hunkTotal}
                </span>
                <button
                  onClick={() => jumpHunk(1)}
                  className="px-2 py-1 rounded-md border border-white/[0.08] hover:text-white hover:bg-white/[0.06]"
                  title="下一个差异块"
                >
                  下一处 ›
                </button>
              </div>
            )}
            <button
              onClick={onDownload}
              disabled={!hasDiff}
              title="下载 Unified diff 文件"
              className={`${badge} ml-auto bg-white/[0.03] border-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              下载 .diff
            </button>
          </div>

          {/* 忽略选项 */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
            <Toggle checked={!!ignore.ignoreCase} onChange={setIgnoreKey("ignoreCase")} label="忽略大小写" />
            <Toggle checked={!!ignore.ignoreTrailingWs} onChange={setIgnoreKey("ignoreTrailingWs")} label="忽略行尾空白" />
            <Toggle checked={!!ignore.ignoreBlankLines} onChange={setIgnoreKey("ignoreBlankLines")} label="忽略空行" />
          </div>

          {tooManyRows && (
            <div className="mb-4">
              <Hint kind="warn">
                差异结果超过 {MAX_RENDER_ROWS} 行，仅渲染前 {MAX_RENDER_ROWS} 行以保持流畅；完整结果可通过「下载 .diff」获取。
              </Hint>
            </div>
          )}

          {view === "split" ? (
            <div
              ref={scrollerRef}
              className="relative rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto max-h-[max(560px,calc(100vh_-_340px))] font-mono text-xs leading-5"
            >
              <div className="sticky top-0 z-10 grid grid-cols-2 bg-[#0c0c0e]/95 backdrop-blur border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-neutral-500">
                <div className="px-3 py-2 border-r border-white/[0.06]">原始 A</div>
                <div className="px-3 py-2">对比 B</div>
              </div>
              <div className="min-w-[720px]">
                {shown.map((row, idx) => {
                  const leftDel = row.kind === "del" || row.kind === "pair";
                  const rightAdd = row.kind === "add" || row.kind === "pair";
                  return (
                    <div key={idx} data-hunk={row.hunk >= 0 ? row.hunk : undefined} className="grid grid-cols-2">
                      <div className={`flex items-start min-w-0 border-r border-white/[0.06] ${leftDel ? "bg-red-500/[0.07]" : ""}`}>
                        <span className={NO_CLS}>{row.left ? row.left.no + 1 : ""}</span>
                        <span className="whitespace-pre-wrap break-words flex-1 min-w-0 pr-3 py-0.5">
                          {row.left ? <LineText text={row.left.text} hl={row.left.hl} side="del" /> : " "}
                        </span>
                      </div>
                      <div className={`flex items-start min-w-0 ${rightAdd ? "bg-emerald-500/[0.07]" : ""}`}>
                        <span className={NO_CLS}>{row.right ? row.right.no + 1 : ""}</span>
                        <span className="whitespace-pre-wrap break-words flex-1 min-w-0 pr-3 py-0.5">
                          {row.right ? <LineText text={row.right.text} hl={row.right.hl} side="add" /> : " "}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              ref={scrollerRef}
              className="relative rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto max-h-[max(560px,calc(100vh_-_340px))] font-mono text-xs leading-5"
            >
              {shownU.map((u, idx) => {
                const tone =
                  u.type === "add"
                    ? "bg-emerald-500/[0.07] text-emerald-300"
                    : u.type === "del"
                      ? "bg-red-500/[0.07] text-red-300"
                      : "text-neutral-500";
                return (
                  <div key={idx} data-hunk={u.hunk >= 0 ? u.hunk : undefined} className={`grid grid-cols-[2.5rem_2.5rem_1rem_1fr] ${tone}`}>
                    <span className="select-none text-right pr-1.5 text-neutral-600 tabular-nums">{u.aNo !== undefined ? u.aNo + 1 : ""}</span>
                    <span className="select-none text-right pr-1.5 text-neutral-600 tabular-nums">{u.bNo !== undefined ? u.bNo + 1 : ""}</span>
                    <span className="select-none text-center opacity-70">{u.type === "add" ? "+" : u.type === "del" ? "−" : ""}</span>
                    <span className="whitespace-pre-wrap break-words pr-3 py-0.5">
                      <LineText text={u.text} hl={u.hl} side={u.type === "add" ? "add" : "del"} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <p className="mt-8 text-center text-xs text-neutral-600 font-mono select-none">🔒 全部本地运算 · 文本不上传服务器</p>
    </div>
  );
}
