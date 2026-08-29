"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface DecodeInfo {
  type: string;
  icon: string;
  details: string;
}

function detectContentType(bytes: number[]): DecodeInfo | null {
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { type: "PNG 图片", icon: "🖼️", details: "PNG 格式图片文件" };
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: "JPEG 图片", icon: "🖼️", details: "JPEG 格式图片文件" };
  }
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { type: "GIF 图片", icon: "🖼️", details: "GIF 格式图片文件" };
  }
  // PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { type: "PDF 文档", icon: "📄", details: "Adobe PDF 文档" };
  }
  // ZIP
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { type: "ZIP 压缩包", icon: "📦", details: "ZIP 格式压缩文件" };
  }
  // RAR
  if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21) {
    return { type: "RAR 压缩包", icon: "📦", details: "RAR 格式压缩文件" };
  }
  // GZIP
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { type: "GZIP 压缩包", icon: "📦", details: "GZIP 格式压缩文件" };
  }
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { type: "BMP 图片", icon: "🖼️", details: "BMP 格式图片文件" };
  }
  // TIFF
  if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)) {
    return { type: "TIFF 图片", icon: "🖼️", details: "TIFF 格式图片文件" };
  }
  // WebP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { type: "WebP 图片", icon: "🖼️", details: "WebP 格式图片文件" };
  }
  // MP3
  if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && bytes[1] === 0xfb)) {
    return { type: "MP3 音频", icon: "🎵", details: "MP3 格式音频文件" };
  }
  // MP4
  if (bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { type: "MP4 视频", icon: "🎬", details: "MP4 格式视频文件" };
  }

  // 检查是否是纯文本（可打印字符比例高）
  const printableCount = bytes.filter((b) => (b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13).length;
  const ratio = printableCount / bytes.length;
  if (ratio > 0.9 && bytes.length > 0) {
    return null; // 是文本，不需要特殊提示
  }

  if (bytes.length > 0) {
    return { type: "二进制数据", icon: "🔢", details: `包含 ${bytes.length} 字节的二进制数据` };
  }

  return null;
}

export default function Base64Page() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"encode" | "decode">("encode");

  const { output, error, decodeInfo } = useMemo(() => {
    if (!input.trim()) return { output: "", error: "", decodeInfo: null };
    try {
      if (mode === "encode") {
        return { output: btoa(unescape(encodeURIComponent(input))), error: "", decodeInfo: null };
      } else {
        const decoded = decodeURIComponent(escape(atob(input)));
        // 尝试检测内容类型
        try {
          const raw = atob(input);
          const bytes = Array.from(raw).map((c) => c.charCodeAt(0));
          const info = detectContentType(bytes);
          return { output: decoded, error: "", decodeInfo: info };
        } catch {
          return { output: decoded, error: "", decodeInfo: null };
        }
      }
    } catch {
      return {
        output: "",
        error: mode === "encode" ? "编码失败" : "解码失败，请检查输入是否为有效的 Base64",
        decodeInfo: null,
      };
    }
  }, [input, mode]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div>
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-600 hover:text-white mb-8 transition-colors">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </Link>

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-emerald-400 border border-emerald-500/20 bg-emerald-500/10">
            转换
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">Base64 编解码</h1>
        </div>
        <p className="text-sm text-neutral-500 font-mono">支持中文 · 编码 / 解码 · 内容识别</p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
          <button
            onClick={() => setMode("encode")}
            className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
              mode === "encode" ? "bg-white text-black" : "text-neutral-500 hover:text-white"
            }`}
          >
            编码
          </button>
          <button
            onClick={() => setMode("decode")}
            className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
              mode === "decode" ? "bg-white text-black" : "text-neutral-500 hover:text-white"
            }`}
          >
            解码
          </button>
        </div>
        {error && <span className="text-xs font-mono text-red-400">{error}</span>}
      </div>

      {/* 内容类型识别 */}
      {decodeInfo && mode === "decode" && output && (
        <div className="mb-6 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{decodeInfo.icon}</span>
            <div>
              <div className="text-sm font-mono text-white">{decodeInfo.type}</div>
              <div className="text-xs font-mono text-neutral-500">{decodeInfo.details}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">
            {mode === "encode" ? "原始文本" : "Base64 文本"}
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "encode" ? "输入要编码的文本..." : "输入要解码的 Base64..."}
            className="w-full h-64 px-4 py-3 rounded-xl font-mono text-sm resize-none"
          />
          {mode === "decode" && input && !error && (
            <div className="mt-2 text-xs font-mono text-neutral-600">
              {input.length} 字符 · {Math.ceil(input.length * 3 / 4)} 字节（解码后）
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
              {mode === "encode" ? "Base64 结果" : "解码结果"}
            </label>
            {output && (
              <button
                onClick={() => copyToClipboard(output)}
                className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors"
              >
                复制
              </button>
            )}
          </div>
          <div className="w-full h-64 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-auto font-mono text-sm whitespace-pre-wrap break-all text-neutral-300">
            {output || <span className="text-neutral-600">结果</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
