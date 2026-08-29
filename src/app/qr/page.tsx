"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";

export default function QRPage() {
  const [url, setUrl] = useState("");
  const [size, setSize] = useState(256);

  const downloadQR = () => {
    const svg = document.querySelector("#qr-code svg") as SVGSVGElement;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = "qrcode.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
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
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-blue-400 border border-blue-500/20 bg-blue-500/10">
            生成
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">链接转二维码</h1>
        </div>
        <p className="text-sm text-neutral-500 font-mono">输入网址，即时生成，支持下载</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">URL</label>
            <textarea
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              rows={3}
              className="w-full px-5 py-4 rounded-xl font-mono text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wider">
              尺寸 · {size}px
            </label>
            <input
              type="range"
              min={128}
              max={512}
              step={32}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          {url && (
            <button
              onClick={downloadQR}
              className="w-full py-3 bg-white text-black rounded-xl font-medium text-sm hover:bg-neutral-200 active:scale-[0.98] transition-all"
            >
              下载 PNG
            </button>
          )}
        </div>

        <div className="flex items-center justify-center">
          <div
            id="qr-code"
            className="p-6 rounded-2xl border border-white/[0.06] bg-white"
          >
            {url ? (
              <QRCodeSVG value={url} size={size} />
            ) : (
              <div
                className="flex items-center justify-center text-neutral-400 border-2 border-dashed border-neutral-200 rounded-xl"
                style={{ width: size, height: size }}
              >
                <span className="text-sm font-mono">输入网址后生成</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
