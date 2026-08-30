/**
 * 二维码工具纯逻辑（无 DOM 依赖，可单测）
 * 设计要点：
 *  1) 批量生成：按行解析、去空行、可选去重、行数/单行长度上限，超限不抛错只计数并提示。
 *  2) Logo 叠加：占边长约 22%（20%–25% 区间），白色圆角底衬内留 margin；叠加时建议 H 级容错。
 *  3) SVG 导出：SVG 字符串由组件序列化 qrcode.react 的 <QRCodeSVG> 得到，
 *     本模块只做纯字符串处理（补 xmlns/xml 声明）与不变式校验（含 <svg> 与 path 数据）。
 *  4) 所有导出文件名取"行序号 + 内容摘要"，非法输入回退，不泄漏 NaN。
 */

export type QrLevel = "L" | "M" | "Q" | "H";

/** 单条二维码内容长度上限（字符） */
export const QR_TEXT_MAX_CHARS = 2000;

/** 批量生成的行数上限 */
export const BATCH_MAX_LINES = 100;

/** Logo 占二维码边长的比例（在 20%–25% 建议区间内取 22%） */
export const LOGO_SIZE_RATIO = 0.22;

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

export function logoBox(totalSide: number): LogoBox {
  const side = typeof totalSide === "number" && Number.isFinite(totalSide) && totalSide > 0 ? Math.floor(totalSide) : 0;
  const box = Math.max(8, Math.round(side * LOGO_SIZE_RATIO));
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
