"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PageHeader, Segmented, CopyButton, Hint, downloadFile } from "@/components/ui";
import { copyText } from "@/lib/format";
import {
  analyzeJson,
  buildJsonTree,
  escapeJsonString,
  JSON_TREE_MAX_NODES,
  unescapeJsonString,
  type JsonIssue,
  type JsonTreeNode,
  type JsonTreeType,
} from "@/lib/json";

/* ---------- 页脚隐私声明 ---------- */

function LocalFooter() {
  return (
    <div className="mt-10 pt-4 border-t border-white/[0.06] flex items-center justify-center gap-1.5 text-xs font-mono text-neutral-600">
      <span aria-hidden="true">🔒</span>
      <span>全部本地运算 · 数据不上传服务器</span>
    </div>
  );
}

/* ---------- 示例数据 ---------- */

const SAMPLE_JSON = `{
  "name": "工具箱",
  "version": "2.1.0",
  "official": true,
  "stars": 12890,
  "tags": ["devtools", "json", "本地优先"],
  "author": { "name": "张三", "email": "zhangsan@example.com" },
  "deps": [
    { "name": "react", "version": 19 },
    { "name": "next", "version": 15 }
  ],
  "description": null
}`;

/* ---------- 操作条按钮 ---------- */

function ActionButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-mono border border-white/[0.08] bg-white/[0.03] text-neutral-300 hover:text-white hover:border-blue-500/40 hover:bg-blue-500/[0.06] transition-all"
    >
      {children}
    </button>
  );
}

/* ---------- 错误 / 警告条目（含行列定位） ---------- */

function IssueLine({ iss }: { iss: JsonIssue }) {
  return (
    <Hint kind={iss.type === "error" ? "error" : iss.type === "warning" ? "warn" : "info"}>
      {iss.line !== undefined && (
        <span className="mr-2 opacity-80">
          第 {iss.line} 行{iss.column !== undefined ? ` 第 ${iss.column} 列` : ""}：
        </span>
      )}
      {iss.message}
      {iss.suggestion && <div className="opacity-70 mt-1">💡 {iss.suggestion}</div>}
    </Hint>
  );
}

/* ---------- 树视图 ---------- */

const TREE_TYPE_LABEL: Record<JsonTreeType, string> = {
  object: "对象",
  array: "数组",
  string: "字符串",
  number: "数字",
  boolean: "布尔",
  null: "null",
};

const TREE_TYPE_COLOR: Record<JsonTreeType, string> = {
  object: "text-blue-300/90",
  array: "text-violet-300/90",
  string: "text-emerald-300",
  number: "text-amber-300",
  boolean: "text-rose-300",
  null: "text-neutral-600",
};

/** 默认展开到该深度（含），更深的容器默认折叠，避免大 JSON 全量渲染 */
const TREE_DEFAULT_EXPAND_DEPTH = 2;
/** 每层最多渲染的子节点数，超出部分折叠显示 */
const TREE_CHILDREN_RENDER_LIMIT = 1000;

/** 收集默认应折叠的容器节点 id（深度达到 minDepth 的） */
function collectDefaultCollapsed(node: JsonTreeNode, minDepth: number, acc: Set<string>): Set<string> {
  if (node.depth >= minDepth && node.children.length > 0) acc.add(node.id);
  for (const c of node.children) collectDefaultCollapsed(c, minDepth, acc);
  return acc;
}

/** 点击复制的值按钮：叶子复制原始值，容器复制格式化 JSON */
function TreeValueButton({ node }: { node: JsonTreeNode }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const onCopy = useCallback(async () => {
    const ok = await copyText(node.copyText);
    setState(ok ? "ok" : "fail");
    setTimeout(() => setState("idle"), 1200);
  }, [node.copyText]);
  return (
    <button
      onClick={onCopy}
      title={`类型：${TREE_TYPE_LABEL[node.type]} · 点击复制`}
      className={`text-left font-mono text-xs break-all rounded px-0.5 -mx-0.5 hover:bg-white/[0.06] transition-colors ${TREE_TYPE_COLOR[node.type]}`}
    >
      {state === "ok" && <span className="text-emerald-400 mr-1">已复制</span>}
      {state === "fail" && <span className="text-red-400 mr-1">复制失败</span>}
      {node.preview}
    </button>
  );
}

function TreeNodeRow({
  node,
  collapsed,
  onToggle,
}: {
  node: JsonTreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const expanded = hasChildren && !isCollapsed;
  const shownChildren = expanded ? node.children.slice(0, TREE_CHILDREN_RENDER_LIMIT) : [];
  const hiddenCount = node.children.length - shownChildren.length;

  return (
    <div>
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: node.depth * 14 }}>
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "展开" : "折叠"}
            className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center text-neutral-600 hover:text-white transition-colors"
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        {node.depth > 0 && (
          <span className="font-mono text-xs text-blue-300/80 break-all flex-shrink max-w-[45%] truncate" title={node.key}>
            {node.key}
          </span>
        )}
        <TreeValueButton node={node} />
      </div>
      {expanded && (
        <div className="border-l border-white/[0.06]" style={{ marginLeft: node.depth * 14 + 8 }}>
          {shownChildren.map((c) => (
            <TreeNodeRow key={c.id} node={c} collapsed={collapsed} onToggle={onToggle} />
          ))}
          {hiddenCount > 0 && (
            <div className="py-0.5 font-mono text-[11px] text-neutral-600" style={{ paddingLeft: 12 }}>
              … 其余 {hiddenCount.toLocaleString("zh-CN")} 项已折叠，请使用文本视图查看
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 主组件 ---------- */

export default function JsonTool() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<2 | 4>(2);
  const [output, setOutput] = useState("");
  const [outputError, setOutputError] = useState("");
  const [view, setView] = useState<"text" | "tree">("text");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const analysis = useMemo(() => analyzeJson(input, indent), [input, indent]);
  const parsed = useMemo<{ ok: boolean; value?: unknown }>(() => {
    if (!input.trim()) return { ok: false };
    try {
      return { ok: true, value: JSON.parse(input) };
    } catch {
      return { ok: false };
    }
  }, [input]);

  const tree = useMemo(() => {
    if (!parsed.ok || !input.trim()) return null;
    return buildJsonTree(parsed.value);
  }, [parsed, input]);

  const defaultCollapsed = useMemo(
    () => (tree?.root ? collectDefaultCollapsed(tree.root, TREE_DEFAULT_EXPAND_DEPTH, new Set<string>()) : new Set<string>()),
    [tree]
  );
  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  const toggleNode = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const errorIssue = analysis.issues.find((i) => i.type === "error");
  const hasError = input.trim().length > 0 && !!errorIssue;

  const doFormat = () => {
    if (parsed.ok) setOutput(JSON.stringify(parsed.value, null, indent));
    setOutputError("");
  };
  const doMinify = () => {
    if (parsed.ok) setOutput(JSON.stringify(parsed.value));
    setOutputError("");
  };
  const doEscape = () => {
    setOutput(escapeJsonString(input));
    setOutputError("");
  };
  const doUnescape = () => {
    const r = unescapeJsonString(input);
    setOutput(r.ok ? r.value : "");
    setOutputError(r.ok ? "" : r.message);
  };
  const fillSample = () => {
    setInput(SAMPLE_JSON);
    setOutput("");
    setOutputError("");
  };

  return (
    <div>
      <PageHeader badge="解析" title="JSON 格式化" subtitle="格式化 · 压缩 · 转义 · 重复键检测 · 树视图" tone="amber" />

      {/* 操作条：单按钮直达 */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
          <span>缩进</span>
          <Segmented
            value={String(indent) as "2" | "4"}
            onChange={(v) => setIndent(Number(v) as 2 | 4)}
            options={[{ value: "2", label: "2" }, { value: "4", label: "4" }]}
            ariaLabel="缩进"
          />
        </div>
        <span className="w-px h-5 bg-white/[0.08]" />
        <ActionButton onClick={doFormat}>格式化</ActionButton>
        <ActionButton onClick={doMinify}>压缩</ActionButton>
        <ActionButton onClick={doEscape}>转义</ActionButton>
        <ActionButton onClick={doUnescape}>去转义</ActionButton>
        <ActionButton onClick={fillSample}>示例数据</ActionButton>
      </div>

      {/* 校验状态：错误定位 / 重复键 / 嵌套深度 */}
      {analysis.issues.length > 0 && (
        <div className="mb-4 space-y-2">
          {analysis.issues.map((iss, i) => (
            <IssueLine key={i} iss={iss} />
          ))}
        </div>
      )}
      {!hasError && analysis.ok && (
        <div className="flex flex-wrap gap-2 mb-4 text-[11px] font-mono">
          {[["属性", analysis.stats?.keys], ["嵌套", `${analysis.stats?.depth}层`], ["对象", analysis.stats?.objects], ["数组", analysis.stats?.arrays], ["大小", analysis.stats?.sizeLabel]].map(([k, v]) => (
            <span key={String(k)} className="px-2 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-neutral-500">
              {k} <span className="text-neutral-300">{v}</span>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 输入 */}
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">输入</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"name":"hello","version":1}'
            className="w-full h-[max(460px,calc(100vh_-_380px))] px-4 py-3 rounded-xl font-mono text-[15px] resize-y"
            spellCheck={false}
          />
        </div>

        {/* 输出：文本 / 树 双视图 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">输出</label>
              <Segmented
                value={view}
                onChange={setView}
                options={[{ value: "text", label: "文本" }, { value: "tree", label: "树" }]}
                ariaLabel="输出视图"
              />
            </div>
            <div className="flex items-center gap-1">
              {view === "text" && output && (
                <>
                  <button
                    onClick={() => {
                      setInput(output);
                      setOutput("");
                      setOutputError("");
                    }}
                    className="text-xs font-mono px-2.5 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    应用为输入
                  </button>
                  <button
                    onClick={() => downloadFile("formatted.json", output, "application/json;charset=utf-8")}
                    title="下载格式化后的 JSON 文件"
                    className="text-xs font-mono px-2.5 py-1 rounded-md text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-colors"
                  >
                    导出 .json
                  </button>
                </>
              )}
            </div>
          </div>

          {view === "text" ? (
            <div className="relative">
              <div className="w-full h-[max(460px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap break-all text-neutral-300">
                {outputError ? (
                  <span className="text-neutral-600">{outputError}</span>
                ) : output ? (
                  output
                ) : (
                  <span className="text-neutral-600">点击上方操作条按钮生成结果</span>
                )}
              </div>
              {output && (
                <div className="absolute right-3 bottom-3">
                  <CopyButton text={output} />
                </div>
              )}
            </div>
          ) : hasError ? (
            <div className="h-[max(460px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
              <p className="text-sm font-mono text-neutral-600">输入存在语法错误，修复后可查看树视图</p>
            </div>
          ) : tree && tree.truncated ? (
            <div className="h-[max(460px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] flex flex-col items-center justify-center gap-2 text-center px-8">
              <p className="text-sm font-mono text-amber-300">数据超过 {JSON_TREE_MAX_NODES.toLocaleString("zh-CN")} 个节点，为避免卡顿已停用树视图</p>
              <p className="text-xs font-mono text-neutral-600">请切换到文本视图查看完整内容</p>
            </div>
          ) : tree?.root ? (
            <div className="w-full h-[max(460px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto">
              <TreeNodeRow node={tree.root} collapsed={collapsed} onToggle={toggleNode} />
              <p className="mt-3 font-mono text-[11px] text-neutral-600">提示：悬停查看类型，点击值复制；容器点击箭头折叠 / 展开</p>
            </div>
          ) : (
            <div className="h-[max(460px,calc(100vh_-_380px))] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
              <p className="text-sm font-mono text-neutral-600">输入合法 JSON 后显示可折叠树</p>
            </div>
          )}
        </div>
      </div>

      <LocalFooter />
    </div>
  );
}
