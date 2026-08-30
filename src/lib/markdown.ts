/** 轻量、安全的 Markdown 渲染（先转义 HTML 再做行内替换，避免 XSS）
 *
 * 支持：标题 / 分割线 / 引用 / 有序无序列表 / 任务列表 / GFM 表格 /
 * 围栏代码块 / 行内代码 / 加粗 / 斜体 / 删除线 / 链接 / 自动链接 / 脚注
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

/** 统一的安全 <a> 生成：协议白名单 + 引号转义（防属性逃逸） */
function linkTag(href: string, label: string): string {
  const safe = SAFE_HREF.test(href) ? href.replace(/"/g, "&quot;") : "#";
  return `<a href="${safe}" class="text-blue-400 underline" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

/* ---------- 脚注 ---------- */

const FN_NAME = "[A-Za-z0-9_-]+";
const FN_DEF_RE = new RegExp(`^\\[\\^(${FN_NAME})\\]:\\s*(.*)$`);
const FN_REF_RE = new RegExp(`\\[\\^(${FN_NAME})\\]`, "g");

/* ---------- 表格 ---------- */

type Align = "text-left" | "text-center" | "text-right" | "";

/** 拆分一行单元格：去掉首尾管道，支持 \\| 转义竖线 */
function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && t[i + 1] === "|") { cur += "|"; i++; continue; }
    if (ch === "|") { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** 对齐分隔行（| :--- | :---: | ---: |）→ 每列对齐类；不是分隔行返回 null */
function alignRow(line: string): Align[] | null {
  const t = line.trim();
  if (!t.includes("|")) return null;
  const cells = splitRow(t);
  if (!cells.length) return null;
  const aligns: Align[] = [];
  for (const c of cells) {
    const m = c.match(/^(:?)(-+)(:?)$/);
    if (!m) return null;
    aligns.push(m[1] && m[3] ? "text-center" : m[1] ? "text-left" : m[3] ? "text-right" : "");
  }
  return aligns;
}

function padCells(cells: string[], n: number): string[] {
  const r = cells.slice(0, n);
  while (r.length < n) r.push("");
  return r;
}

/* ---------- 行内语法 ---------- */

function inline(s: string, footnote?: (name: string) => string | null): string {
  let out = s
    .replace(/`([^`]+)`/g, (_m, c) => `<code class="px-1.5 py-0.5 rounded bg-white/10 text-rose-300">${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    // <https://…> / <mailto:…> 显式自动链接（<> 已被 esc 转义为 &lt; &gt;）
    .replace(/&lt;((?:https?:\/\/|mailto:)[^\s]+?)&gt;/gi, (_m, u) => linkTag(u, u))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => linkTag(u, t));

  // 裸 URL 自动链接：左边界限定行首/空白/左括号，右侧不越过引号与尖括号，
  // 并在 CJK 字符处截断（中文后通常没有空格），因此不会命中上方已生成的 href 属性
  const URL_CH = String.raw`[^\s&"<\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]`;
  out = out.replace(new RegExp(`(^|[\\s(])(https?:\\/\\/${URL_CH}*(?:&amp;${URL_CH}*)*)`, "g"), (_m, pre: string, url: string) => {
    const [core, trail] = splitUrlTrail(url);
    return `${pre}${linkTag(core, core)}${trail}`;
  });

  // 脚注引用 [^name]：有定义时替换为上标跳转，未知引用保持原样
  if (footnote) {
    out = out.replace(FN_REF_RE, (m, name: string) => footnote(name) ?? m);
  }
  return out;
}

/** 剥离 URL 尾部 ASCII 标点；右括号在括号配平时归还给 URL */
function splitUrlTrail(url: string): [string, string] {
  const m = url.match(/[.,;:!?)]+$/);
  if (!m) return [url, ""];
  let core = url.slice(0, url.length - m[0].length);
  let trail = m[0];
  while (trail.startsWith(")")) {
    const candidate = `${core})`;
    const opens = (candidate.match(/\(/g) ?? []).length;
    const closes = (candidate.match(/\)/g) ?? []).length;
    if (closes <= opens) { core = candidate; trail = trail.slice(1); } else break;
  }
  return [core, trail];
}

export function renderMarkdown(src: string): string {
  const lines = esc(src).split("\n");
  const isFence = (l: string) => /^```/.test(l.replace(/\s+$/, ""));

  // 预扫描 1：标记代码围栏内外的行（围栏内的行不做任何语法解析）
  const codeMask: boolean[] = new Array(lines.length).fill(false);
  {
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      if (isFence(lines[i])) { inCode = !inCode; codeMask[i] = true; }
      else codeMask[i] = inCode;
    }
  }

  // 预扫描 2：脚注定义 + 引用顺序（编号按正文首次引用先后，GFM 行为）
  const defs = new Map<string, string>();
  const refOrder: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (codeMask[i]) continue;
    const line = lines[i].replace(/\s+$/, "");
    const def = line.match(FN_DEF_RE);
    if (def) { if (!defs.has(def[1])) defs.set(def[1], def[2]); continue; }
    for (const m of line.matchAll(FN_REF_RE)) {
      if (!refOrder.includes(m[1])) refOrder.push(m[1]);
    }
  }
  const fnNum = new Map<string, number>();
  for (const name of refOrder) {
    if (defs.has(name) && !fnNum.has(name)) fnNum.set(name, fnNum.size + 1);
  }
  const footnoteHtml = (name: string): string | null => {
    const num = fnNum.get(name);
    return num == null
      ? null
      : `<sup id="fnref-${name}"><a href="#fn-${name}" class="text-blue-400 no-underline">${num}</a></sup>`;
  };

  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let headingSeq = 0; // 标题锚点序号（与 extractOutline 的 id 规则一致）

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");

    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre class="rounded-xl bg-black/40 border border-white/[0.06] p-4 overflow-auto my-3"><code class="text-sm font-mono text-neutral-300">${codeBuf.join("\n")}</code></pre>`);
        codeBuf = []; inCode = false;
      } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    if (!line.trim()) { closeList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-sm"]; out.push(`<h${lvl} id="md-h-${headingSeq++}" class="font-bold text-white ${sizes[lvl - 1]} mt-5 mb-2">${inline(h[2], footnoteHtml)}</h${lvl}>`); continue; }

    if (/^(---|\*\*\*)\s*$/.test(line)) { closeList(); out.push('<hr class="border-white/10 my-5" />'); continue; }

    if (/^&gt;\s?/.test(line)) { closeList(); out.push(`<blockquote class="border-l-2 border-blue-500/50 pl-4 text-neutral-400 my-2">${inline(line.replace(/^&gt;\s?/, ""), footnoteHtml)}</blockquote>`); continue; }

    // 脚注定义行：不在正文渲染，文末统一汇总
    if (FN_DEF_RE.test(line)) { closeList(); continue; }

    // GFM 表格：当前行含 | 且下一行是对齐分隔行
    const aligns = i + 1 < lines.length && line.includes("|") ? alignRow(lines[i + 1]) : null;
    if (aligns) {
      closeList();
      const n = aligns.length;
      const cellCls = (base: string, a: Align) => (a ? `${base} ${a}` : base);
      const th = padCells(splitRow(line), n)
        .map((c, k) => `<th class="${cellCls("px-3 py-2 border-b border-white/10 font-semibold text-white", aligns[k])}">${inline(c, footnoteHtml)}</th>`)
        .join("");
      const rows: string[] = [];
      let j = i + 2;
      while (j < lines.length) {
        const l2 = lines[j].replace(/\s+$/, "");
        const t2 = l2.trim();
        if (!t2 || t2.startsWith("```") || !l2.includes("|")) break;
        const tds = padCells(splitRow(l2), n)
          .map((c, k) => `<td class="${cellCls("px-3 py-2 border-t border-white/[0.06]", aligns[k])}">${inline(c, footnoteHtml)}</td>`)
          .join("");
        rows.push(`<tr>${tds}</tr>`);
        j++;
      }
      out.push(`<table class="w-full my-3 text-sm border-collapse"><thead><tr>${th}</tr></thead><tbody>${rows.join("")}</tbody></table>`);
      i = j - 1;
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") { closeList(); out.push('<ul class="list-disc pl-6 my-2 space-y-1">'); listType = "ul"; }
      const task = ul[1].match(/^\[([ xX])\]\s*(.*)$/);
      if (task) {
        const checked = task[1] !== " " ? " checked" : "";
        out.push(`<li class="list-none"><input type="checkbox" disabled${checked} class="accent-blue-500 mr-1.5" />${inline(task[2], footnoteHtml)}</li>`);
      } else {
        out.push(`<li>${inline(ul[1], footnoteHtml)}</li>`);
      }
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if (listType !== "ol") { closeList(); out.push('<ol class="list-decimal pl-6 my-2 space-y-1">'); listType = "ol"; } out.push(`<li>${inline(ol[1], footnoteHtml)}</li>`); continue; }

    closeList();
    out.push(`<p class="my-2 leading-relaxed">${inline(line, footnoteHtml)}</p>`);
  }
  if (inCode) out.push(`<pre class="rounded-xl bg-black/40 border border-white/[0.06] p-4 overflow-auto my-3"><code>${codeBuf.join("\n")}</code></pre>`);
  closeList();

  // 脚注汇总：仅渲染被正文引用过的定义，顺序 = 首次引用顺序
  if (fnNum.size) {
    out.push('<hr class="border-white/10 my-5" />');
    out.push('<section class="text-sm text-neutral-400 my-3"><ol class="list-decimal pl-6 space-y-1">');
    for (const [name] of fnNum) {
      const body = inline(defs.get(name) ?? "", footnoteHtml);
      out.push(`<li id="fn-${name}" class="leading-relaxed">${body} <a href="#fnref-${name}" class="text-blue-400 no-underline text-xs" aria-label="返回正文">↩</a></li>`);
    }
    out.push("</ol></section>");
  }

  return out.join("\n");
}

/* ---------- 大纲目录 ---------- */

export interface OutlineItem {
  /** 标题级别 1-6 */
  level: number;
  /** 标题原始文本 */
  text: string;
  /** 与 renderMarkdown 输出一致的锚点 id（md-h-<序号>） */
  id: string;
  /** 源文本中的 0 基行号 */
  line: number;
}

/** 从 Markdown 源码提取标题大纲（跳过围栏代码块内的行）。
 *  id 序号规则与 renderMarkdown 的标题 id 一致，可互相锚定。 */
export function extractOutline(src: string): OutlineItem[] {
  const lines = src.split("\n");
  const out: OutlineItem[] = [];
  let inCode = false;
  let seq = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    if (/^```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.push({ level: h[1].length, text: h[2].trim(), id: `md-h-${seq++}`, line: i });
  }
  return out;
}

/* ---------- 编辑器动作（工具栏插入 / 选区包裹 / 快捷键共用） ---------- */

export type MdAction =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "ul"
  | "ol"
  | "quote"
  | "table";

export interface MdEditResult {
  /** 动作后的完整文本 */
  text: string;
  /** 建议的新选区（textarea.setSelectionRange 参数） */
  selStart: number;
  selEnd: number;
}

const INLINE_WRAP: Partial<Record<MdAction, { marker: string; placeholder: string }>> = {
  bold: { marker: "**", placeholder: "加粗文本" },
  italic: { marker: "*", placeholder: "斜体文本" },
  code: { marker: "`", placeholder: "代码" },
};

const LINE_PREFIX: Partial<Record<MdAction, string>> = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  ul: "- ",
  quote: "> ",
};

const OL_RE = /^\d+\.\s/;

/** 行内包裹：有选区时包住选区（已包裹则解除），无选区时插入占位文本并选中。 */
function applyWrap(src: string, start: number, end: number, marker: string, placeholder: string): MdEditResult {
  const sel = src.slice(start, end);
  const m = marker.length;
  const before = src.slice(Math.max(0, start - m), start);
  const after = src.slice(end, end + m);
  if (sel && before === marker && after === marker) {
    const text = src.slice(0, start - m) + sel + src.slice(end + m);
    return { text, selStart: start - m, selEnd: end - m };
  }
  const inner = sel || placeholder;
  const text = src.slice(0, start) + marker + inner + marker + src.slice(end);
  const s = start + m;
  return { text, selStart: s, selEnd: s + inner.length };
}

function applyLink(src: string, start: number, end: number): MdEditResult {
  const sel = src.slice(start, end);
  const label = sel || "链接文本";
  const url = "https://";
  const text = `${src.slice(0, start)}[${label}](${url})${src.slice(end)}`;
  const uStart = start + label.length + 3; // 越过 "[label](""
  return { text, selStart: uStart, selEnd: uStart + url.length };
}

/** 行前缀动作（标题/列表/引用）：作用于选区覆盖的整块行，全部已带前缀时解除（toggle）。 */
function applyLineAction(src: string, start: number, end: number, action: MdAction): MdEditResult {
  const lineStart = src.lastIndexOf("\n", start - 1) + 1;
  const nl = src.indexOf("\n", end);
  const lineEnd = nl === -1 ? src.length : nl;
  const lines = src.slice(lineStart, lineEnd).split("\n");
  const isOl = action === "ol";
  const prefix = isOl ? "" : LINE_PREFIX[action] ?? "";
  const has = (l: string) => (isOl ? OL_RE.test(l) : l.startsWith(prefix));
  const all = lines.every(has);
  const outLines = lines.map((l, i) => {
    if (all) return isOl ? l.replace(OL_RE, "") : l.slice(prefix.length);
    if (has(l)) return l;
    return isOl ? `${i + 1}. ${l}` : `${prefix}${l}`;
  });
  const newBlock = outLines.join("\n");
  const text = src.slice(0, lineStart) + newBlock + src.slice(lineEnd);
  if (start === end) {
    const cursor = lineStart + newBlock.length;
    return { text, selStart: cursor, selEnd: cursor };
  }
  return { text, selStart: lineStart, selEnd: lineStart + newBlock.length };
}

function applyTable(src: string, start: number, end: number): MdEditResult {
  const snippet = "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n";
  const lead = start > 0 && src[start - 1] !== "\n" ? "\n" : "";
  const text = src.slice(0, start) + lead + snippet + src.slice(end);
  const c1 = start + lead.length + 2; // 选中"列1"便于直接输入
  return { text, selStart: c1, selEnd: c1 + 2 };
}

/** 对 [selStart, selEnd) 选区应用 Markdown 编辑动作，返回新文本与新选区。 */
export function applyMdAction(src: string, selStart: number, selEnd: number, action: MdAction): MdEditResult {
  const len = src.length;
  let start = Math.min(Math.max(0, selStart), len);
  let end = Math.min(Math.max(0, selEnd), len);
  if (start > end) [start, end] = [end, start];

  const wrap = INLINE_WRAP[action];
  if (wrap) return applyWrap(src, start, end, wrap.marker, wrap.placeholder);
  if (action === "link") return applyLink(src, start, end);
  if (action === "table") return applyTable(src, start, end);
  return applyLineAction(src, start, end, action);
}
