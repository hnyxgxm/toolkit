"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, CopyButton, Hint, Stat } from "@/components/ui";
import {
  WARN_BYTES,
  MAX_BYTES,
  PREVIEW_MAX_BYTES,
  encodeBase64,
  encodeTextToBase64,
  toDataUri,
  parseDataUri,
  sniffMime,
  extForMime,
  isImageMime,
  base64ByteLength,
  formatBytes,
  tryDecodeBase64,
  tryDecodeBase64ToText,
} from "@/lib/base64";

/* ---------- 组件层通用（浏览器交互：下载 / 大文本展示截断） ---------- */

const B64_DISPLAY_LIMIT = 2048;

function truncateForDisplay(s: string): string {
  return s.length > B64_DISPLAY_LIMIT
    ? `${s.slice(0, B64_DISPLAY_LIMIT)} …（共 ${s.length.toLocaleString("zh-CN")} 字符，可用上方按钮复制完整内容）`
    : s;
}

function triggerDownload(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface FileEntry {
  name: string;
  size: number;
  type: string;
  bytes: Uint8Array;
}

/* ---------- 文本编解码（保持原有行为：UTF-8 中文安全 + URL-Safe 变体） ---------- */

function TextPanel() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: "", error: "" };
    if (mode === "encode") return { output: encodeTextToBase64(input, urlSafe), error: "" };
    const r = tryDecodeBase64ToText(input, { urlSafe });
    return r.ok ? { output: r.value, error: "" } : { output: "", error: "输入不是合法的 Base64 字符串，无法解码" };
  }, [input, mode, urlSafe]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Segmented value={mode} onChange={setMode} options={[{ value: "encode", label: "编码" }, { value: "decode", label: "解码" }]} />
        <Segmented value={urlSafe ? "url" : "std"} onChange={(v) => setUrlSafe(v === "url")} options={[{ value: "std", label: "标准" }, { value: "url", label: "URL-Safe" }]} ariaLabel="变体" />
      </div>
      {error && <div className="mb-4"><Hint kind="error">{error}</Hint></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">{mode === "encode" ? "原文" : "Base64"}</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "encode" ? "输入要编码的文本，支持中文" : "输入要解码的 Base64"} className="w-full h-[420px] px-4 py-3 rounded-xl font-mono text-sm resize-none" spellCheck={false} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">{mode === "encode" ? "Base64" : "解码结果"}</label>
            <CopyButton text={output} />
          </div>
          <div className="w-full h-[420px] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap break-all text-neutral-300">
            {output || <span className="text-neutral-600">结果显示在这里</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 文件 → Base64 / DataURI ---------- */

function FileEncodePanel() {
  const [entry, setEntry] = useState<FileEntry | null>(null);
  const [refuseMsg, setRefuseMsg] = useState("");
  const [readError, setReadError] = useState("");

  const pick = (file: File | null) => {
    setRefuseMsg("");
    setReadError("");
    setEntry(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setRefuseMsg(`文件 ${formatBytes(file.size)} 超过 20MB 上限，为避免占满浏览器内存已拒绝处理，请先压缩或裁剪文件。`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEntry({ name: file.name, size: file.size, type: file.type, bytes: new Uint8Array(reader.result as ArrayBuffer) });
    };
    reader.onerror = () => setReadError("文件读取失败，请重试。");
    reader.readAsArrayBuffer(file);
  };

  const result = useMemo(() => {
    if (!entry) return null;
    const b64 = encodeBase64(entry.bytes);
    const mime = entry.type || sniffMime(entry.bytes);
    const isImage = isImageMime(mime);
    const preview = isImage && entry.size <= PREVIEW_MAX_BYTES;
    return { b64, mime, isImage, preview, dataUri: preview ? toDataUri(mime, b64) : "" };
  }, [entry]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-5">
        <label className="flex flex-col items-center justify-center gap-1.5 h-36 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:border-blue-500/40 hover:bg-blue-500/[0.04] cursor-pointer transition-colors">
          <svg className="w-6 h-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-sm text-neutral-400">{entry ? entry.name : "点击选择文件"}</span>
          <span className="text-xs font-mono text-neutral-600">{entry ? `${formatBytes(entry.size)} · ${entry.type || "未知类型"}` : "任意类型 · 编码为 Base64 / DataURI · ≤ 20MB"}</span>
          <input type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </label>
        {refuseMsg && <Hint kind="error">{refuseMsg}</Hint>}
        {readError && <Hint kind="error">{readError}</Hint>}
        {entry && result && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="原始大小" value={formatBytes(entry.size)} />
              <Stat label="Base64 字符" value={result.b64.length.toLocaleString("zh-CN")} />
              <Stat label="类型" value={result.mime} tone="accent" />
            </div>
            {entry.size > WARN_BYTES && (
              <Hint kind="warn">文件较大（{formatBytes(entry.size)}），编码与复制可能需要数秒，请耐心等待。</Hint>
            )}
          </>
        )}
      </div>
      <div>
        {entry && result ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">Base64 / DataURI 输出</span>
              <div className="flex items-center gap-1">
                <CopyButton text={result.dataUri || toDataUri(result.mime, result.b64)} label="复制 DataURI" />
                <CopyButton text={result.b64} label="复制 Base64" />
                <button
                  onClick={() => triggerDownload(`${entry.name || "output"}.txt`, new Blob([result.b64], { type: "text/plain;charset=utf-8" }))}
                  className="text-xs font-mono px-2.5 py-1 rounded-md text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-colors"
                >
                  下载 .txt
                </button>
              </div>
            </div>
            <div className="h-[200px] px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-xs whitespace-pre-wrap break-all text-neutral-300">
              {truncateForDisplay(result.b64)}
            </div>
            {result.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.dataUri} alt="文件预览" className="max-h-56 w-auto rounded-xl border border-white/[0.06] bg-white/[0.02] object-contain" />
            )}
            {result.isImage && !result.preview && (
              <Hint kind="info">图片超过 {formatBytes(PREVIEW_MAX_BYTES)}，已跳过预览，仅保留复制与下载。</Hint>
            )}
          </div>
        ) : (
          <div className="h-full min-h-[236px] rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-sm font-mono text-neutral-600">
            编码结果显示在这里
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Base64 / DataURI → 文件 ---------- */

type DecodeOutcome =
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      mime: string;
      bytes: Uint8Array;
      b64: string;
      preview: boolean;
      dataUri: string;
    };

function FileDecodePanel() {
  const [input, setInput] = useState("");

  const result = useMemo<DecodeOutcome | null>(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    let mime = "";
    let b64 = trimmed;
    if (/^data:/i.test(trimmed)) {
      const parsed = parseDataUri(trimmed);
      if (!parsed) return { kind: "error", message: "该 DataURI 不是 Base64 编码（缺少 ;base64, 段），暂不支持解码。" };
      mime = parsed.mime;
      b64 = parsed.base64;
    }

    const estimated = base64ByteLength(b64);
    if (estimated > MAX_BYTES) {
      return { kind: "error", message: `解码内容约 ${formatBytes(estimated)}，超过 20MB 处理上限，为避免占满浏览器内存已拒绝处理。` };
    }

    const r = tryDecodeBase64(b64, { urlSafe: true });
    if (!r.ok) return { kind: "error", message: `解码失败：${r.message}，请检查输入是否完整。` };

    const bytes = r.value;
    const resolved = mime || sniffMime(bytes);
    const preview = isImageMime(resolved) && bytes.length <= PREVIEW_MAX_BYTES;
    const stdB64 = encodeBase64(bytes);
    return {
      kind: "ok",
      mime: resolved,
      bytes,
      b64: stdB64,
      preview,
      dataUri: preview ? toDataUri(resolved, stdB64) : "",
    };
  }, [input]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">Base64 / DataURI 输入</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴纯 Base64 或 DataURI（如 data:image/png;base64,…）"
          className="w-full h-[420px] px-4 py-3 rounded-xl font-mono text-sm resize-none"
          spellCheck={false}
        />
      </div>
      <div className="space-y-4">
        {result?.kind === "error" && <Hint kind="error">{result.message}</Hint>}
        {result?.kind === "ok" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="识别类型" value={result.mime} tone="accent" />
              <Stat label="文件大小" value={formatBytes(result.bytes.length)} tone={result.bytes.length > WARN_BYTES ? "warn" : "default"} />
            </div>
            {result.bytes.length > WARN_BYTES && (
              <Hint kind="warn">文件较大（{formatBytes(result.bytes.length)}），预览与下载可能较慢。</Hint>
            )}
            {result.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.dataUri} alt="解码文件预览" className="max-h-56 w-auto rounded-xl border border-white/[0.06] bg-white/[0.02] object-contain" />
            )}
            {isImageMime(result.mime) && !result.preview && (
              <Hint kind="info">图片超过 {formatBytes(PREVIEW_MAX_BYTES)}，已跳过预览，仅保留下载。</Hint>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => triggerDownload(`decoded.${extForMime(result.mime)}`, new Blob([result.bytes as unknown as BlobPart], { type: result.mime }))}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-mono hover:opacity-90 transition-opacity"
              >
                下载解码文件（.{extForMime(result.mime)}）
              </button>
              <CopyButton text={result.b64} label="复制 Base64" />
            </div>
          </>
        )}
        {!result && (
          <div className="h-[400px] rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-sm font-mono text-neutral-600">
            解码结果（识别类型 / 预览 / 下载）显示在这里
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 文件面板 ---------- */

function FilePanel() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  return (
    <div>
      <div className="mb-6">
        <Segmented value={mode} onChange={setMode} options={[{ value: "encode", label: "编码（文件 → Base64）" }, { value: "decode", label: "解码（Base64 → 文件）" }]} ariaLabel="方向" />
      </div>
      {mode === "encode" ? <FileEncodePanel /> : <FileDecodePanel />}
    </div>
  );
}

export default function Base64Tool() {
  const [tab, setTab] = useState<"text" | "file">("text");
  return (
    <div>
      <PageHeader badge="转换" title="Base64 编解码" subtitle="UTF-8 中文安全 · 文件 ↔ Base64 / DataURI · 支持 URL-Safe 变体" tone="emerald" />
      <div className="mb-6">
        <Segmented value={tab} onChange={setTab} options={[{ value: "text", label: "文本" }, { value: "file", label: "文件" }]} ariaLabel="内容类型" />
      </div>
      {tab === "text" ? <TextPanel /> : <FilePanel />}
    </div>
  );
}
