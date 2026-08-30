/** JSON 分析（纯函数，可单测） */

export interface JsonIssue {
  type: "error" | "warning" | "info";
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface JsonStats {
  keys: number;
  depth: number;
  arrays: number;
  objects: number;
  sizeLabel: string;
}

export interface JsonAnalysis {
  ok: boolean;
  output: string;
  issues: JsonIssue[];
  stats: JsonStats | null;
}

function sizeOf(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * 从原始文本检测"同一对象内重复的 key"。
 * 注意：不能用 JSON.parse 后的对象检测——parse 会静默丢弃重复 key，
 * 这也是旧实现（遍历 parsed）永远测不出重复的根本原因。
 */
export function findDuplicateKeys(raw: string): string[] {
  const dup = new Set<string>();
  const stack: Set<string>[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "{" || c === "[") { stack.push(new Set()); i++; continue; }
    if (c === "}" || c === "]") { stack.pop(); i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') { if (raw[j] === "\\") j++; j++; }
      const str = raw.slice(i + 1, j);
      let k = j + 1;
      while (k < raw.length && /\s/.test(raw[k])) k++;
      if (raw[k] === ":" && stack.length) {
        const top = stack[stack.length - 1];
        if (top.has(str)) dup.add(str);
        else top.add(str);
      }
      i = k;
      continue;
    }
    i++;
  }
  return [...dup];
}

/* ==================== P0 错误定位：行 / 列 + 中文说明 ==================== */

export interface JsonErrorInfo {
  line?: number;
  column?: number;
  /** 面向用户的中文错误说明 */
  message: string;
  /** 原始 JSON.parse 报错信息（调试用） */
  raw: string;
  suggestion?: string;
}

/** 前缀扫描兜底的最大长度（超过则跳过，避免大输入多次 parse 卡顿） */
const FALLBACK_SCAN_MAX_LENGTH = 500_000;

/** 0 起始偏移 → 1 起始的行号与列号 */
function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const end = Math.max(0, Math.min(offset, text.length));
  const lines = text.slice(0, end).split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** 把 V8 的英文报错映射为中文说明（按从具体到泛化匹配） */
function mapParseMessage(msg: string): string {
  if (/unexpected end of JSON input/i.test(msg)) return "输入意外结束：JSON 尚未写完整，请检查是否缺少引号、逗号、花括号或方括号";
  if (/unterminated string/i.test(msg)) return "字符串未闭合：缺少结尾的英文双引号";
  if (/expected double-quoted property name|expected property name or '\}'/i.test(msg)) return "对象属性名必须是用英文双引号包裹的字符串";
  if (/expected ':' after property name/i.test(msg)) return "属性名后缺少冒号（:）";
  if (/expected ',' or '\}' after property value/i.test(msg)) return "属性值后缺少逗号（,），或对象未用 } 闭合";
  if (/expected ',' or '\]' after array element/i.test(msg)) return "数组元素后缺少逗号（,），或数组未用 ] 闭合";
  if (/bad escaped character/i.test(msg)) return "非法的转义字符：字符串内仅允许 \\\\ \\/ \\\" \\b \\f \\n \\r \\t 与 \\uXXXX";
  if (/bad unicode escape/i.test(msg)) return "\\u 转义不合法：必须跟随 4 位十六进制数字";
  if (/bad control character/i.test(msg)) return "字符串中含有未转义的控制字符（换行、制表符等必须写成 \\n \\t）";
  if (/no number after minus sign/i.test(msg)) return "负号（-）后必须紧跟数字";
  if (/exponent part is missing a number/i.test(msg)) return "科学计数法不完整：e/E 后必须紧跟数字";
  if (/unexpected non-whitespace character after JSON/i.test(msg)) return "JSON 已结束但后面还有多余内容：请检查是否有多余字符或多个值拼接";
  if (/unexpected number/i.test(msg)) return "意外的数字：数字格式不合法（如前导 0 或多余的符号）";
  if (/unexpected string/i.test(msg)) return "意外的字符串：该位置不应出现字符串";
  if (/unexpected keyword/i.test(msg)) return "意外的关键字：JSON 仅支持 true / false / null";
  if (/unexpected token/i.test(msg)) {
    const m = msg.match(/Unexpected token ('(.?)'|([^\s,]+))/);
    const tok = m?.[2] ?? m?.[3] ?? "";
    return `意外的符号${tok ? `「${tok}」` : ""}：此处不是合法的 JSON 内容，请检查引号、逗号或冒号`;
  }
  return msg;
}

/** 常见错误的修复建议（启发式） */
function suggestFix(text: string): string | undefined {
  if (/[\u201C\u201D\u2018\u2019]/.test(text)) return "检测到中文引号（“”‘’），JSON 必须使用英文引号";
  const t = text.trim();
  if (t.startsWith("{") && !t.endsWith("}")) return "可能缺少闭合括号 }";
  if (t.startsWith("[") && !t.endsWith("]")) return "可能缺少闭合方括号 ]";
  if (/,\s*[}\]]/.test(text)) return "可能存在多余逗号：最后一个属性或元素后不应有逗号";
  if (text.includes("'") && !text.includes('"')) return "JSON 不能使用单引号，请改为英文双引号";
  return undefined;
}

/** 前缀是否可能成为合法 JSON（parse 成功，或仅因输入被截断而失败） */
function isExtendablePrefix(prefix: string): boolean {
  try {
    JSON.parse(prefix);
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    if (/unexpected end of JSON input|unterminated string/i.test(msg)) return true;
    // V8 在"期望状态遇到 EOF"时报 "Expected ... at position <prefix 长度>"，同样属于可延展前缀
    const pos = msg.match(/in JSON at position (\d+)/i);
    return !!pos && Number(pos[1]) === prefix.length;
  }
}

/**
 * 兜底定位：部分 V8 报错（如新版 "Unexpected token ':', ... is not valid JSON"）不含 position。
 * 二分查找"最长的可延展前缀"，出错符号就在其后一位，复杂度 O(log n) 次 parse。
 */
function locateByPrefixScan(text: string): number | null {
  if (!text || text.length > FALLBACK_SCAN_MAX_LENGTH) return null;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (isExtendablePrefix(text.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * 从 JSON.parse 的报错信息中解析出错位置（行/列），并给出中文说明。
 * 兼容三种格式：
 *  - 旧版：Unexpected token } in JSON at position 8
 *  - 新版：... in JSON at position 7 (line 1 column 8)
 *  - 无位置：Unexpected token ':', "..." is not valid JSON（走前缀扫描兜底）
 */
export function describeJsonParseError(text: string, rawMessage: string): JsonErrorInfo {
  const info: JsonErrorInfo = { message: mapParseMessage(rawMessage), raw: rawMessage };
  const pos = rawMessage.match(/in JSON at position (\d+)/i);
  if (pos) {
    const { line, column } = offsetToLineCol(text, Number(pos[1]));
    info.line = line;
    info.column = column;
  } else {
    const lc = rawMessage.match(/\(line (\d+) column (\d+)\)/);
    if (lc) {
      info.line = Number(lc[1]);
      info.column = Number(lc[2]);
    } else {
      const off = locateByPrefixScan(text);
      if (off !== null) {
        const { line, column } = offsetToLineCol(text, off);
        info.line = line;
        info.column = column;
      }
    }
  }
  info.suggestion = suggestFix(text);
  return info;
}

export function analyzeJson(text: string, indent: 2 | 4 = 2): JsonAnalysis {
  const issues: JsonIssue[] = [];
  if (!text.trim()) return { ok: false, output: "", issues, stats: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const info = describeJsonParseError(text, (e as Error).message);
    return {
      ok: false,
      output: "",
      issues: [{ type: "error", message: info.message, line: info.line, column: info.column, suggestion: info.suggestion }],
      stats: null,
    };
  }

  const stats: JsonStats = { keys: 0, depth: 0, arrays: 0, objects: 0, sizeLabel: sizeOf(text) };
  (function walk(o: unknown, d: number) {
    stats.depth = Math.max(stats.depth, d);
    if (Array.isArray(o)) {
      stats.arrays++;
      o.forEach((x) => walk(x, d + 1));
    } else if (o && typeof o === "object") {
      stats.objects++;
      for (const k of Object.keys(o)) {
        stats.keys++;
        walk((o as Record<string, unknown>)[k], d + 1);
      }
    }
  })(parsed, 0);

  const dup = findDuplicateKeys(text);
  if (dup.length) issues.push({ type: "warning", message: `同一对象内重复的 key：${dup.join("、")}`, suggestion: "重复 key 只有最后一个生效，建议删除重复项" });
  if (stats.depth > 10) issues.push({ type: "warning", message: `嵌套过深（${stats.depth} 层）`, suggestion: "超过 10 层影响可读性，考虑扁平化" });

  return { ok: true, output: JSON.stringify(parsed, null, indent), issues, stats };
}

export function minifyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return "";
  }
}

/* ==================== P1 可折叠树视图 ==================== */

export type JsonTreeType = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface JsonTreeNode {
  /** 唯一路径（如 $.deps[0].name），同时作为折叠状态 key */
  id: string;
  /** 键名；数组元素为字符串下标；根为 root */
  key: string;
  type: JsonTreeType;
  /** 展示预览：叶子为值预览，容器为 {…} N 项 / […] N 项 */
  preview: string;
  /** 点击复制的内容：字符串复制原始值，容器复制格式化 JSON */
  copyText: string;
  children: JsonTreeNode[];
  depth: number;
}

export interface JsonTreeResult {
  root: JsonTreeNode | null;
  nodeCount: number;
  /** 因超过 maxNodes 被截断 */
  truncated: boolean;
}

/** 树视图节点上限：超过则提示改用文本视图 */
export const JSON_TREE_MAX_NODES = 10000;

/** 树节点最大展开深度（防御性上限，避免病态递归） */
const TREE_MAX_DEPTH = 64;

const TREE_VALUE_PREVIEW_LIMIT = 80;

function jsonTypeOf(v: unknown): JsonTreeType {
  if (v === null) return "null";
  switch (typeof v) {
    case "object":
      return Array.isArray(v) ? "array" : "object";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

function previewOf(v: unknown, type: JsonTreeType): string {
  if (type === "string") {
    const q = JSON.stringify(v as string);
    return q.length > TREE_VALUE_PREVIEW_LIMIT ? `${q.slice(0, TREE_VALUE_PREVIEW_LIMIT)}…` : q;
  }
  if (type === "number" || type === "boolean" || type === "null") return String(v);
  const n = type === "array" ? (v as unknown[]).length : Object.keys(v as Record<string, unknown>).length;
  return `${type === "array" ? "[…]" : "{…}"} ${n} 项`;
}

function copyValueOf(v: unknown, type: JsonTreeType): string {
  if (type === "string") return v as string;
  if (type === "object" || type === "array") return JSON.stringify(v, null, 2);
  return String(v);
}

function childPath(path: string, key: string, isArrayItem: boolean): string {
  if (isArrayItem) return `${path}[${key}]`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/**
 * 把已解析的 JSON 值构建为可折叠树。
 * maxNodes 限制节点总量（默认 1 万），超出即停止扩展并标记 truncated，防止大 JSON 卡死页面。
 */
export function buildJsonTree(value: unknown, maxNodes: number = JSON_TREE_MAX_NODES): JsonTreeResult {
  let nodeCount = 0;
  let truncated = false;

  function visit(v: unknown, key: string, depth: number, path: string): JsonTreeNode {
    nodeCount++;
    const type = jsonTypeOf(v);
    const node: JsonTreeNode = {
      id: path,
      key,
      type,
      preview: previewOf(v, type),
      copyText: copyValueOf(v, type),
      children: [],
      depth,
    };
    if ((type === "object" || type === "array") && depth < TREE_MAX_DEPTH) {
      const entries: Array<[string, unknown]> =
        type === "array"
          ? (v as unknown[]).map((x, i) => [String(i), x] as [string, unknown])
          : Object.entries(v as Record<string, unknown>);
      for (const [k, child] of entries) {
        if (nodeCount >= maxNodes) {
          truncated = true;
          break;
        }
        node.children.push(visit(child, k, depth + 1, childPath(path, k, type === "array")));
      }
    }
    return node;
  }

  const root = visit(value, "root", 0, "$");
  return { root, nodeCount, truncated };
}

/* ==================== 转义 / 去转义（JSON 字符串字面量） ==================== */

/** 把任意文本转成可放入 JSON 字符串字面量的内容（不含两端引号） */
export function escapeJsonString(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

export type JsonUnescapeResult = { ok: true; value: string } | { ok: false; message: string };

/** 去转义：接受带两端引号或不带引号的转义文本，还原为原始字符串 */
export function unescapeJsonString(s: string): JsonUnescapeResult {
  const t = s.trim();
  if (!t) return { ok: true, value: "" };
  const quoted =
    t.length >= 2 && t.startsWith('"') && t.endsWith('"')
      ? t
      : `"${t.replace(/\r\n?/g, "\n").replace(/\t/g, "\\t").replace(/\n/g, "\\n")}"`;
  try {
    const v: unknown = JSON.parse(quoted);
    if (typeof v !== "string") return { ok: false, message: "输入不是 JSON 字符串，无法去转义" };
    return { ok: true, value: v };
  } catch {
    return { ok: false, message: "去转义失败：请确认输入是合法的 JSON 转义文本（引号、反斜杠需成对转义）" };
  }
}
