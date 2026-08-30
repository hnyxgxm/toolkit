/**
 * HTML 实体转义 / 反转义（纯函数，无 DOM 依赖）。
 * - 命名风格最小集：& < > " '（' 输出 &#39;，兼容性最好）
 * - 全量模式：额外转义 nbsp / copy / mdash / 数学符号等约 70 个常用命名实体
 * - 数字风格：&#十进制; 与 &#x十六进制;
 * - 反转义：命名（含全量表）+ 十/十六进制数字实体全部兼容；未闭合实体（缺分号）
 *   默认保持原样并上报位置，tolerant=true 时按 HTML 宽容语义强制解码。
 */

export type EntityStyle = "named" | "dec" | "hex";

/** 命名实体表：name（不含 & 与 ;）→ 字符 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  times: "×", divide: "÷", cent: "¢", pound: "£", yen: "¥", euro: "€",
  sect: "§", para: "¶", middot: "·", deg: "°", plusmn: "±", micro: "µ",
  frac14: "¼", frac12: "½", frac34: "¾", dagger: "†", Dagger: "‡", bull: "•",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ",
  lambda: "λ", mu: "μ", pi: "π", sigma: "σ", phi: "φ", omega: "ω", Omega: "Ω",
  infin: "∞", ne: "≠", le: "≤", ge: "≥", larr: "←", uarr: "↑", rarr: "→",
  darr: "↓", harr: "↔", forall: "∀", part: "∂", exist: "∃", empty: "∅",
  nabla: "∇", isin: "∈", sum: "∑", prod: "∏", radic: "√", int: "∫",
  asymp: "≈", equiv: "≡",
};

/** 命名风格最小集（与转义输出一一对应） */
const MINIMAL_NAMED: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** 全量模式额外转义的字符 → 命名实体（排除最小集五个字符，避免覆盖 &#39; 约定） */
const MINIMAL_NAMES = new Set(["amp", "lt", "gt", "quot", "apos"]);
const EXTRA_CHAR_TO_NAMED: Record<string, string> = {};
for (const [name, ch] of Object.entries(NAMED_ENTITIES)) {
  if (MINIMAL_NAMES.has(name)) continue;
  EXTRA_CHAR_TO_NAMED[ch] = `&${name};`;
}

/** 字符进入正则字符类时需转义的元字符 */
function escapeClassChar(c: string): string {
  return /[\]\\^-]/.test(c) ? `\\${c}` : c;
}

function numericEntity(cp: number, style: "dec" | "hex"): string {
  return style === "dec" ? `&#${cp};` : `&#x${cp.toString(16).toUpperCase()};`;
}

export interface EscapeEntitiesOptions {
  style?: EntityStyle;
  /** 全量模式：除最小集外，同时转义全量表中的字符 */
  full?: boolean;
}

/** HTML 实体转义：始终转义 & < > " '，可选风格与全量模式 */
export function escapeHtmlEntities(input: string, opts?: EscapeEntitiesOptions): string {
  const style = opts?.style ?? "named";
  const full = opts?.full ?? false;
  if (!input) return "";

  if (style === "named") {
    const map = full ? { ...EXTRA_CHAR_TO_NAMED, ...MINIMAL_NAMED } : MINIMAL_NAMED;
    const re = new RegExp(`[${Object.keys(map).map(escapeClassChar).join("")}]`, "g");
    return input.replace(re, (c) => map[c]);
  }

  const extra = full ? Object.keys(EXTRA_CHAR_TO_NAMED) : [];
  const re = new RegExp(`[&<>"'${extra.map(escapeClassChar).join("")}]`, "g");
  return input.replace(re, (c) => numericEntity(c.codePointAt(0) as number, style));
}

/* ==================== 反转义 ==================== */

export interface UnclosedEntity {
  /** 原样呈现的实体文本（如 "&amp"） */
  entity: string;
  /** 在输入字符串中的 0 起始偏移 */
  offset: number;
}

export interface UnescapeEntitiesResult {
  text: string;
  /** 遇到的未闭合（缺分号）实体列表（容错与否都会记录，供 UI 提示） */
  unclosed: UnclosedEntity[];
}

const ENTITY_RE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*)(;?)/g;

/**
 * HTML 实体反转义：命名（全量表）+ 数字（十/十六进制）实体一次性解码（不重复解析）。
 * - 未知实体（如 &unknown;）原样保留
 * - 未闭合实体（缺分号）两种模式都记录到 unclosed 供 UI 提示：
 *   默认原样保留；tolerant=true 时按 HTML 宽容语义强制解码
 */
export function unescapeHtmlEntities(input: string, opts?: { tolerant?: boolean }): UnescapeEntitiesResult {
  const tolerant = opts?.tolerant ?? false;
  const unclosed: UnclosedEntity[] = [];
  if (!input) return { text: "", unclosed };

  const text = input.replace(ENTITY_RE, (whole: string, body: string, semi: string, offset: number) => {
    if (body.charCodeAt(0) === 0x23) {
      // 数字实体：&#123; / &#x1F600;
      const cp = body.charCodeAt(1) === 0x78 || body.charCodeAt(1) === 0x58 ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return whole;
      if (!semi) {
        unclosed.push({ entity: whole, offset });
        if (!tolerant) return whole;
      }
      return String.fromCodePoint(cp);
    }
    const mapped = NAMED_ENTITIES[body];
    if (mapped === undefined) return whole;
    if (!semi) {
      unclosed.push({ entity: whole, offset });
      if (!tolerant) return whole;
    }
    return mapped;
  });

  return { text, unclosed };
}

/** 检测文本中的未闭合实体（不做解码） */
export function findUnclosedEntities(input: string): UnclosedEntity[] {
  return unescapeHtmlEntities(input).unclosed;
}
