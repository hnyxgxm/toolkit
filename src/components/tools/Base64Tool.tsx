"use client";

import { useMemo, useState } from "react";
import { PageHeader, Segmented, CopyButton, Hint } from "@/components/ui";

function encodeUtf8B64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function decodeB64Utf8(s: string): string {
  const bin = atob(s.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function Base64Tool() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: "", error: "" };
    try {
      if (mode === "encode") {
        let out = encodeUtf8B64(input);
        if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        return { output: out, error: "" };
      }
      let s = input.trim();
      if (urlSafe) s = s.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      return { output: decodeB64Utf8(s), error: "" };
    } catch {
      return { output: "", error: "输入不是合法的 Base64 字符串，无法解码" };
    }
  }, [input, mode, urlSafe]);

  return (
    <div>
      <PageHeader badge="转换" title="Base64 编解码" subtitle="UTF-8 中文安全 · 支持 URL-Safe 变体" tone="emerald" />
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
