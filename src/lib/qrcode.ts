/**
 * 二维码工具纯逻辑（无 DOM 依赖，可单测）
 * 设计要点：
 *  1) 批量生成：按行解析、去空行、可选去重、行数/单行长度上限，超限不抛错只计数并提示。
 *  2) Logo 叠加：占边长约 22%（20%–25% 区间），白色圆角底衬内留 margin；叠加时建议 H 级容错。
 *  3) SVG 导出：SVG 字符串由组件序列化 qrcode.react 的 <QRCodeSVG> 得到，
 *     本模块只做纯字符串处理（补 xmlns/xml 声明）与不变式校验（含 <svg> 与 path 数据）。
 *  4) 所有导出文件名取"行序号 + 内容摘要"，非法输入回退，不泄漏 NaN。
 *  5) 配色可靠性：WCAG 相对亮度/对比度纯函数 + 低对比度与反色风险提示（阈值 3:1 / 2:1）。
 *  6) 参数记忆：sanitizeQrSettings 校验并钳制 localStorage 读出的尺寸/颜色/容错/Logo 占比，
 *     只存参数、不存生成内容；垃圾输入一律回退默认值。
 */

export type QrLevel = "L" | "M" | "Q" | "H";

/** 单条二维码内容长度上限（字符） */
export const QR_TEXT_MAX_CHARS = 2000;

/** 批量生成的行数上限 */
export const BATCH_MAX_LINES = 100;

/** Logo 占二维码边长的比例（在 20%–25% 建议区间内取 22%） */
export const LOGO_SIZE_RATIO = 0.22;

/** Logo 大小滑条的允许区间（比例） */
export const LOGO_SCALE_MIN = 0.15;
export const LOGO_SCALE_MAX = 0.3;

/** Logo 白色底衬内边距占底衬边长的比例（即 logo 本体四周的 margin） */
export const LOGO_PAD_RATIO = 0.12;

/** 叠加 Logo 时建议使用的容错等级 */
export const LOGO_SAFE_LEVEL: QrLevel = "H";

/** Logo 图片文件大小上限（字节） */
export const LOGO_MAX_FILE_BYTES = 2 * 1024 * 1024;

/* ---------------- 批量行解析 ---------------- */

export interface BatchParseOptions {
  /** 是否去除重复行（按整行 trim 后比较） */
  dedupe?: boolean;
  /** 行数上限，默认 BATCH_MAX_LINES；非法值回退默认 */
  maxLines?: number;
  /** 单行字符数上限，默认 QR_TEXT_MAX_CHARS；非法值回退默认 */
  maxCharsPerLine?: number;
}

export interface BatchParseResult {
  /** 有效内容行（已 trim，顺序保留） */
  lines: string[];
  /** 是否因超过行数上限被截断 */
  truncated: boolean;
  /** 去重删除的行数（仅 dedupe 时可能 > 0） */
  duplicatesRemoved: number;
  /** 跳过的空行数量 */
  blankSkipped: number;
  /** 超过单行长度上限被跳过的行数 */
  tooLongSkipped: number;
}

export function parseBatchLines(raw: string, opts: BatchParseOptions = {}): BatchParseResult {
  const maxLines =
    typeof opts.maxLines === "number" && Number.isFinite(opts.maxLines) && opts.maxLines > 0
      ? Math.floor(opts.maxLines)
      : BATCH_MAX_LINES;
  const maxChars =
    typeof opts.maxCharsPerLine === "number" &&
    Number.isFinite(opts.maxCharsPerLine) &&
    opts.maxCharsPerLine > 0
      ? Math.floor(opts.maxCharsPerLine)
      : QR_TEXT_MAX_CHARS;

  const result: BatchParseResult = {
    lines: [],
    truncated: false,
    duplicatesRemoved: 0,
    blankSkipped: 0,
    tooLongSkipped: 0,
  };
  const seen = opts.dedupe ? new Set<string>() : null;

  for (const rawLine of String(raw ?? "").split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line) {
      result.blankSkipped += 1;
      continue;
    }
    if (line.length > maxChars) {
      result.tooLongSkipped += 1;
      continue;
    }
    if (seen) {
      if (seen.has(line)) {
        result.duplicatesRemoved += 1;
        continue;
      }
      seen.add(line);
    }
    if (result.lines.length >= maxLines) {
      result.truncated = true;
      break;
    }
    result.lines.push(line);
  }
  return result;
}

/* ---------------- Logo 叠加几何与容错建议 ---------------- */

export interface LogoBox {
  /** 白色圆角底衬边长（px，与画布同尺度） */
  box: number;
  /** 底衬内边距（logo 本体与衬底边缘的 margin） */
  pad: number;
}

export function logoBox(totalSide: number, ratio: number = LOGO_SIZE_RATIO): LogoBox {
  const side = typeof totalSide === "number" && Number.isFinite(totalSide) && totalSide > 0 ? Math.floor(totalSide) : 0;
  // 允许自定义比例，但钳制在几何安全区间（10%–35%），防止 Logo 过大吞掉定位图案
  const r =
    typeof ratio === "number" && Number.isFinite(ratio)
      ? Math.min(0.35, Math.max(0.1, ratio))
      : LOGO_SIZE_RATIO;
  const box = Math.max(8, Math.round(side * r));
  const pad = Math.max(2, Math.round(box * LOGO_PAD_RATIO));
  return { box, pad };
}

/** 叠加 Logo 时建议的容错等级：一律提升到 H；无 Logo 保持原值 */
export function suggestLevel(hasLogo: boolean, current: QrLevel): QrLevel {
  return hasLogo ? LOGO_SAFE_LEVEL : current;
}

/* ---------------- 导出文件名 ---------------- */

function summarizeForFileName(content: string): string {
  const cleaned = String(content ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return cleaned || "text";
}

/** 文件名 = qr-行序号(3 位补零)-内容摘要.ext；非法序号回退为 1，空内容回退为 text */
export function qrDownloadFileName(index: number, content: string, ext: "png" | "svg" = "png"): string {
  const n = typeof index === "number" && Number.isFinite(index) && index >= 1 ? Math.floor(index) : 1;
  const seq = String(n).padStart(3, "0");
  return `qr-${seq}-${summarizeForFileName(content)}.${ext}`;
}

/* ---------------- SVG 字符串处理与不变式 ---------------- */

/** 把组件序列化出的 <svg> 补成独立可用的 .svg 文本（补 xmlns 与 XML 声明，幂等） */
export function ensureStandaloneSvg(svg: string): string {
  let s = String(svg ?? "").trim();
  if (!s) return "";
  if (/<svg[\s>]/.test(s)) {
    if (!/\sxmlns=/.test(s)) {
      s = s.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!s.startsWith("<?xml")) {
      s = `<?xml version="1.0" encoding="UTF-8"?>\n${s}`;
    }
  }
  return s;
}

/** SVG 导出前的硬性不变式校验：必须含 <svg> 根元素、<path> 且带非空 d 数据、viewBox */
export function svgInvariantErrors(svg: string): string[] {
  const s = String(svg ?? "");
  const errors: string[] = [];
  if (!s.trim()) {
    errors.push("SVG 内容为空");
    return errors;
  }
  if (!/<svg[\s>]/.test(s)) {
    errors.push("缺少 <svg> 根元素");
  }
  if (!/<path[\s>]/.test(s)) {
    errors.push("缺少 <path> 路径数据");
  } else if (!/\bd\s*=\s*"[^"]+"/.test(s)) {
    errors.push("path 缺少 d 路径数据");
  }
  if (!/viewBox\s*=/.test(s)) {
    errors.push("缺少 viewBox 属性");
  }
  return errors;
}

/* ---------------- 配色对比度（扫码可靠性） ---------------- */

/** 可扫码的最低对比度（WCAG 口径 3:1，扫码器普遍以此为主观下限） */
export const QR_CONTRAST_MIN = 3;
/** 对比度低于该值视为大概率无法识别 */
export const QR_CONTRAST_BAD = 2;

function hexToRgb(hex: string): [number, number, number] | null {
  let h = String(hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 相对亮度：0（全黑）–1（全白）；非法输入回退 0 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度（1–21），与参数顺序无关 */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastRisk {
  /** 对比度比值 */
  ratio: number;
  /** ok ≥3:1；warn 2–3:1；bad <2:1 */
  level: "ok" | "warn" | "bad";
  /** 是否"深底浅码"反色（前景比背景亮） */
  inverted: boolean;
  /** 风险说明（ok 且非反色时为 undefined） */
  message?: string;
}

/** 低对比度 / 反色风险提示（纯函数） */
export function contrastRisk(fg: string, bg: string): ContrastRisk {
  const ratio = contrastRatio(fg, bg);
  const inverted = relativeLuminance(fg) > relativeLuminance(bg);
  let level: ContrastRisk["level"] = "ok";
  let message: string | undefined;
  if (ratio < QR_CONTRAST_BAD) {
    level = "bad";
    message = `前景与背景对比度过低（${ratio.toFixed(1)}:1 < ${QR_CONTRAST_BAD}:1），大概率无法被扫码器识别，请调整颜色。`;
  } else if (ratio < QR_CONTRAST_MIN) {
    level = "warn";
    message = `对比度偏低（${ratio.toFixed(1)}:1 < ${QR_CONTRAST_MIN}:1），部分扫码器可能识别失败，建议加深前景色或提亮背景色。`;
  }
  if (inverted) {
    const inv = "当前为「深底浅码」反色（浅色码点 + 深色背景），部分扫码器不支持，建议深色前景 + 浅色背景。";
    message = message ? `${message}${inv}` : inv;
  }
  return { ratio, level, inverted, message };
}

/* ---------------- 参数记忆（localStorage，不存生成内容） ---------------- */

export interface QrSettings {
  /** 画布尺寸 128–512 */
  size: number;
  /** 静区 0–8 格 */
  margin: number;
  /** 容错等级，默认 Q */
  level: QrLevel;
  fg: string;
  bg: string;
  /** Logo 占比 0.15–0.30 */
  logoScale: number;
}

export const DEFAULT_QR_SETTINGS: QrSettings = {
  size: 256,
  margin: 2,
  level: "Q",
  fg: "#111111",
  bg: "#ffffff",
  logoScale: LOGO_SIZE_RATIO,
};

const QR_LEVELS: readonly QrLevel[] = ["L", "M", "Q", "H"];
const HEX6 = /^#[0-9a-f]{6}$/;

function clampNum(raw: unknown, min: number, max: number, fallback: number, round = true): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.min(max, Math.max(min, n));
  return round ? Math.round(v) : v;
}

function sanitizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim().toLowerCase();
  return HEX6.test(s) ? s : fallback;
}

/** 校验/钳制从 localStorage 读出的参数（垃圾输入一律回退默认值，不抛错） */
export function sanitizeQrSettings(raw: unknown): QrSettings {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_QR_SETTINGS;
  const level = QR_LEVELS.includes(o.level as QrLevel) ? (o.level as QrLevel) : d.level;
  // logoScale 以 0–1 比例存储，越界值直接钳制回 [15%, 30%]
  const rawScale =
    typeof o.logoScale === "number" && Number.isFinite(o.logoScale) ? o.logoScale : Number.NaN;
  return {
    size: clampNum(o.size, 128, 512, d.size),
    margin: clampNum(o.margin, 0, 8, d.margin),
    level,
    fg: sanitizeHex(o.fg, d.fg),
    bg: sanitizeHex(o.bg, d.bg),
    logoScale: clampNum(rawScale, LOGO_SCALE_MIN, LOGO_SCALE_MAX, d.logoScale, false),
  };
}
