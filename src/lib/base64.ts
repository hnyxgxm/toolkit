/** Base64 编解码核心（纯函数，无 DOM 依赖；FileReader / Blob 下载 / 预览等浏览器交互一律放在组件层） */

/** 体积阈值：超过 5MB 提示警告 */
export const WARN_BYTES = 5 * 1024 * 1024;
/** 体积阈值：超过 20MB 拒绝处理 */
export const MAX_BYTES = 20 * 1024 * 1024;
/** 体积阈值：超过 5MB 的图像跳过 dataURI 预览，仅保留下载 */
export const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const B64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < B64_ALPHABET.length; i++) B64_LOOKUP[B64_ALPHABET.charCodeAt(i)] = i;

/** 非法输入错误，message 为可直接展示的中文说明 */
export class Base64Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Base64Error";
  }
}

/* ==================== 编码 ==================== */

/** 字节 → 标准 Base64；urlSafe=true 时输出 URL-Safe 变体（+/ → -_ 并去掉末尾 =） */
export function encodeBase64(bytes: Uint8Array, urlSafe = false): string {
  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < len;
    const has2 = i + 2 < len;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += has1 ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += has2 ? B64_ALPHABET[b2 & 63] : "=";
  }
  return urlSafe ? toUrlSafe(out) : out;
}

function toUrlSafe(s: string): string {
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 文本 → Base64（先按 UTF-8 编码，中文/emoji 安全） */
export function encodeTextToBase64(text: string, urlSafe = false): string {
  return encodeBase64(new TextEncoder().encode(text), urlSafe);
}

/* ==================== 解码 ==================== */

/**
 * 清洗输入：去所有空白字符 → 处理 URL-Safe 变体（可选）→ 校验填充符与字符集。
 * 兼容无填充（forgiving-base64 语义）：允许缺省末尾 =，但填充符只能出现在末尾且最多 2 个。
 */
function cleanB64(input: string, urlSafe: boolean): string {
  let s = input.replace(/\s/g, "");
  if (urlSafe) s = s.replace(/-/g, "+").replace(/_/g, "/");
  const padMatch = s.match(/=+$/);
  const padLen = padMatch ? padMatch[0].length : 0;
  if (padLen > 2) throw new Base64Error("Base64 填充符（=）数量非法，末尾最多 2 个");
  s = s.slice(0, s.length - padLen);
  if (s.includes("=")) throw new Base64Error("Base64 填充符（=）只能出现在末尾");
  if (!s) return "";
  if (/[^A-Za-z0-9+/]/.test(s)) {
    throw new Base64Error("Base64 含有非法字符（仅允许 A-Z a-z 0-9 + / - _ 与末尾 =）");
  }
  if (s.length % 4 === 1) throw new Base64Error("Base64 长度不正确：去掉填充符后末组剩余 1 个字符");
  return s;
}

/** Base64 → 字节；非法输入抛出 Base64Error（中文说明），不会返回错误数据 */
export function decodeBase64(input: string, opts?: { urlSafe?: boolean }): Uint8Array {
  const s = cleanB64(input, opts?.urlSafe ?? false);
  if (!s) return new Uint8Array(0);
  const rem = s.length % 4;
  const outLen = Math.floor(s.length / 4) * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);
  let o = 0;
  let i = 0;
  for (; i + 4 <= s.length; i += 4) {
    const n =
      (B64_LOOKUP[s.charCodeAt(i)] << 18) |
      (B64_LOOKUP[s.charCodeAt(i + 1)] << 12) |
      (B64_LOOKUP[s.charCodeAt(i + 2)] << 6) |
      B64_LOOKUP[s.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 0xff;
    out[o++] = (n >> 8) & 0xff;
    out[o++] = n & 0xff;
  }
  if (rem === 2) {
    const n = (B64_LOOKUP[s.charCodeAt(i)] << 18) | (B64_LOOKUP[s.charCodeAt(i + 1)] << 12);
    out[o] = (n >> 16) & 0xff;
  } else if (rem === 3) {
    const n =
      (B64_LOOKUP[s.charCodeAt(i)] << 18) |
      (B64_LOOKUP[s.charCodeAt(i + 1)] << 12) |
      (B64_LOOKUP[s.charCodeAt(i + 2)] << 6);
    out[o++] = (n >> 16) & 0xff;
    out[o] = (n >> 8) & 0xff;
  }
  return out;
}

/* ==================== 非抛异常包装（组件层直接使用，报错不抛异常） ==================== */

export type TryResult<T> = { ok: true; value: T } | { ok: false; message: string };

function toFailMessage(e: unknown): string {
  return e instanceof Base64Error ? e.message : "输入不是合法的 Base64，无法解码";
}

/** Base64 → 字节，非法输入返回 { ok:false, message } 而不抛异常 */
export function tryDecodeBase64(input: string, opts?: { urlSafe?: boolean }): TryResult<Uint8Array> {
  try {
    return { ok: true, value: decodeBase64(input, opts) };
  } catch (e) {
    return { ok: false, message: toFailMessage(e) };
  }
}

/** Base64 → UTF-8 文本，非法输入抛出 Base64Error */
export function decodeBase64ToText(input: string, opts?: { urlSafe?: boolean }): string {
  return new TextDecoder().decode(decodeBase64(input, opts));
}

/** Base64 → UTF-8 文本，非法输入返回 { ok:false, message } 而不抛异常 */
export function tryDecodeBase64ToText(input: string, opts?: { urlSafe?: boolean }): TryResult<string> {
  try {
    return { ok: true, value: decodeBase64ToText(input, opts) };
  } catch (e) {
    return { ok: false, message: toFailMessage(e) };
  }
}

/* ==================== 严格校验（解码失败时定位首处非法字符） ==================== */

export interface Base64Issue {
  /** 原始输入中的 0 起始偏移（长度类错误指向最后一个数据字符） */
  offset: number;
  /** 出错的字符；长度类错误为空字符串 */
  char: string;
  /** 可直接展示的中文说明 */
  message: string;
}

/**
 * 严格校验 Base64 输入，返回首处问题及偏移；合法返回 null。
 * 语义与 decodeBase64 完全一致：允许任意空白穿插；urlSafe=true 时额外允许 - _；
 * 填充符（=）只能出现在末尾且最多 2 个；去掉填充后末组剩余 1 个字符视为长度非法。
 */
export function findBase64Issue(input: string, opts?: { urlSafe?: boolean }): Base64Issue | null {
  const urlSafe = opts?.urlSafe ?? false;
  const isData = (c: string): boolean =>
    (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "+" || c === "/" || (urlSafe && (c === "-" || c === "_"));
  let padStart = -1;
  let padCount = 0;
  let dataLen = 0;
  let lastData = -1;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (/\s/.test(c)) continue;
    if (c === "=") {
      if (padStart === -1) padStart = i;
      padCount++;
      if (padCount > 2) return { offset: i, char: "=", message: "Base64 填充符（=）数量非法，末尾最多 2 个" };
      continue;
    }
    if (padStart !== -1) return { offset: i, char: c, message: "Base64 填充符（=）只能出现在末尾" };
    if (isData(c)) {
      dataLen++;
      lastData = i;
      continue;
    }
    return {
      offset: i,
      char: c,
      message: `非法字符「${c}」（仅允许 A-Z a-z 0-9 + /${urlSafe ? " - _" : ""} 与末尾 =）`,
    };
  }
  if (dataLen % 4 === 1) {
    return { offset: Math.max(lastData, 0), char: lastData >= 0 ? input[lastData] : "", message: "Base64 长度不正确：去掉填充符后末组剩余 1 个字符" };
  }
  return null;
}

/* ==================== DataURI ==================== */

export interface DataUriParts {
  /** 小写 mime；头部缺省时为空字符串 */
  mime: string;
  /** base64 段原文（含空白与可能的 URL-Safe 字符，交给 decodeBase64 清洗） */
  base64: string;
}

/**
 * 解析 `data:<mime>[;params];base64,<payload>` 形式的 DataURI。
 * 非 base64 型 DataURI（如 data:text/plain,hello）返回 null。
 */
export function parseDataUri(input: string): DataUriParts | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*);base64,([\s\S]+)$/i.exec(input.trim());
  if (!m) return null;
  return { mime: m[1].toLowerCase(), base64: m[3] };
}

/** mime + Base64 → DataURI；mime 缺省按 application/octet-stream */
export function toDataUri(mime: string, base64: string): string {
  return `data:${mime || "application/octet-stream"};base64,${base64}`;
}

/* ==================== mime 嗅探与扩展名 ==================== */

const MAGIC_RULES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50] },
  { mime: "image/bmp", offset: 0, bytes: [0x42, 0x4d] },
  { mime: "image/x-icon", offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "application/zip", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/zip", offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: "application/zip", offset: 0, bytes: [0x50, 0x4b, 0x07, 0x08] },
  { mime: "application/gzip", offset: 0, bytes: [0x1f, 0x8b] },
];

/**
 * 按 magic bytes 嗅探常见文件格式；嗅探不出（含空文件/纯文本）按
 * application/octet-stream 处理。规则表里 -1 表示通配字节。
 */
export function sniffMime(bytes: Uint8Array): string {
  for (const rule of MAGIC_RULES) {
    if (bytes.length < rule.bytes.length) continue;
    let hit = true;
    for (let i = 0; i < rule.bytes.length; i++) {
      const want = rule.bytes[i];
      if (want !== -1 && bytes[rule.offset + i] !== want) {
        hit = false;
        break;
      }
    }
    if (hit) return rule.mime;
  }
  return "application/octet-stream";
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/gzip": "gz",
  "text/plain": "txt",
  "application/octet-stream": "bin",
};

/** mime → 下载扩展名，未知类型回落 bin */
export function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? "bin";
}

/** 可内联 <img> 预览的图像类型 */
export function isImageMime(mime: string): boolean {
  return ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon"].includes(mime);
}

/* ==================== 体积估算与格式化 ==================== */

/** 依据 Base64 文本估算解码后字节数（用于 >20MB 预检，不校验合法性） */
export function base64ByteLength(input: string): number {
  const s = input.replace(/\s/g, "");
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor(((s.length - pad) * 3) / 4);
}

/** 字节数 → "512 B / 12.3 KB / 4.56 MB" 展示 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
