/** JSON 分析（纯函数，可单测） */

export interface JsonIssue {
  type: "error" | "warning" | "info";
  message: string;
  line?: number;
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

export function analyzeJson(text: string, indent: 2 | 4 = 2): JsonAnalysis {
  const issues: JsonIssue[] = [];
  if (!text.trim()) return { ok: false, output: "", issues, stats: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    let line: number | undefined;
    const pos = msg.match(/position (\d+)/);
    if (pos) line = text.substring(0, Number(pos[1])).split("\n").length;

    let suggestion: string | undefined;
    const t = text.trim();
    if (t.startsWith("{") && !t.endsWith("}")) suggestion = "缺少闭合括号 }";
    else if (t.startsWith("[") && !t.endsWith("]")) suggestion = "缺少闭合方括号 ]";
    else if (/,\s*[}\]]/.test(text)) suggestion = "多余逗号：最后一个元素后不应有逗号";
    else if (/[""]|['']/.test(text)) suggestion = "检测到中文引号，JSON 必须使用英文双引号";
    else if (text.includes("'") && !text.includes('"')) suggestion = "JSON 不能用单引号，需双引号";

    return { ok: false, output: "", issues: [{ type: "error", message: msg, line, suggestion }], stats: null };
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
