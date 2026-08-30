"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  CopyButton,
  Field,
  Hint,
  NumberInput,
  PageHeader,
  Segmented,
  Stat,
  Toggle,
} from "@/components/ui";
import {
  BATCH_MAX_LINES,
  LOGO_MAX_FILE_BYTES,
  LOGO_PAD_RATIO,
  LOGO_SIZE_RATIO,
  QR_TEXT_MAX_CHARS,
  ensureStandaloneSvg,
  logoBox,
  parseBatchLines,
  qrDownloadFileName,
  suggestLevel,
  svgInvariantErrors,
} from "@/lib/qrcode";

type Mode = "single" | "batch";

const BATCH_PREVIEW_SIZE = 128;
const BATCH_DOWNLOAD_GAP_MS = 150;

/** 手绘圆角矩形路径（不依赖较新的 ctx.roundRect） */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 把画布导出为 PNG dataURL；可选在中心叠加白色圆角底衬 + Logo */
async function exportCanvasPng(canvas: HTMLCanvasElement, logoUrl: string | null): Promise<string> {
  const off = document.createElement("canvas");
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  ctx.drawImage(canvas, 0, 0);
  if (logoUrl) {
    try {
      const img = new Image();
      img.src = logoUrl;
      await img.decode();
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const { box, pad } = logoBox(off.width);
        const x = (off.width - box) / 2;
        const y = (off.height - box) / 2;
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, x, y, box, box, Math.round(box * 0.18));
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        const inner = box - pad * 2;
        const scale = Math.min(inner / img.naturalWidth, inner / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h);
        ctx.restore();
      }
    } catch {
      // Logo 解码/绘制失败时退化为不带 Logo 的导出
    }
  }
  return off.toDataURL("image/png");
}

export default function QrTool() {
  const [mode, setMode] = useState<Mode>("single");
  const [text, setText] = useState("https://hnyxgxm.github.io/toolkit");
  const [size, setSize] = useState("256");
  const [margin, setMargin] = useState("2");
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [fg, setFg] = useState("#ffffff");
  const [bg, setBg] = useState("#0a0a0b");

  // Logo
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  // 批量
  const [batchText, setBatchText] = useState("");
  const [dedupe, setDedupe] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // SVG 导出（由隐藏的 QRCodeSVG 序列化得到）
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgText, setSvgText] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const batchRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const tooLong = text.length > QR_TEXT_MAX_CHARS;
  const qrSize = Number(size) || 256;
  const qrMargin = Number(margin) || 0;

  const batch = useMemo(() => parseBatchLines(batchText, { dedupe }), [batchText, dedupe]);

  // 单条内容变化后重新序列化 SVG 字符串
  useEffect(() => {
    const el = svgRef.current;
    setSvgText(el ? ensureStandaloneSvg(el.outerHTML) : "");
  }, [text, size, margin, level, fg, bg]);

  const svgErrors = useMemo(() => (svgText ? svgInvariantErrors(svgText) : []), [svgText]);
  const suggestedLevel = suggestLevel(Boolean(logoDataUrl), level);

  const handleLogoFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("仅支持图片文件（PNG/JPG/WebP/SVG 等）");
      return;
    }
    if (file.size > LOGO_MAX_FILE_BYTES) {
      setLogoError("Logo 图片不能超过 2MB，请压缩后重试");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(String(reader.result));
      setLogoError(null);
    };
    reader.onerror = () => setLogoError("读取图片失败，请重试");
    reader.readAsDataURL(file);
  };

  const downloadPng = async () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = await exportCanvasPng(canvas, logoDataUrl);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = qrDownloadFileName(1, text, "png");
    a.click();
  };

  const downloadSvgFile = () => {
    if (!svgText || svgErrors.length > 0) return;
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = qrDownloadFileName(1, text, "svg");
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBatchOne = async (index: number) => {
    const canvas = batchRefs.current.get(index);
    const line = batch.lines[index];
    if (!canvas || line === undefined) return;
    const dataUrl = await exportCanvasPng(canvas, null);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = qrDownloadFileName(index + 1, line, "png");
    a.click();
  };

  const downloadBatchAll = async () => {
    if (progress) return;
    const items = batch.lines;
    if (items.length === 0) return;
    setProgress({ done: 0, total: items.length });
    try {
      for (let i = 0; i < items.length; i++) {
        setProgress({ done: i + 1, total: items.length });
        await downloadBatchOne(i);
        await new Promise((r) => setTimeout(r, BATCH_DOWNLOAD_GAP_MS));
      }
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      <PageHeader badge="生成" title="二维码生成" subtitle="链接/文本 → 二维码 · 支持 Logo 叠加、批量生成与 SVG 导出" tone="blue" />

      <div className="mb-6">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          ariaLabel="生成模式"
          options={[
            { value: "single", label: "单个" },
            { value: "batch", label: "批量" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 左侧：参数区 */}
        <div className="space-y-5">
          {mode === "single" ? (
            <>
              <Field label="内容" hint={`${text.length} / ${QR_TEXT_MAX_CHARS} 字符`}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="输入链接或任意文本"
                  className="w-full h-28 px-4 py-3 rounded-xl font-mono text-sm resize-none"
                />
              </Field>

              <Field
                label="Logo（可选）"
                hint="PNG/JPG · ≤2MB · 占边长 22%"
                error={logoError ?? undefined}
              >
                <div className="flex items-center gap-3">
                  <label className="px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm font-mono text-neutral-300 cursor-pointer hover:bg-white/[0.06] transition-colors">
                    选择图片
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        handleLogoFile(file);
                      }}
                    />
                  </label>
                  {logoDataUrl && (
                    <>
                      <img src={logoDataUrl} alt="Logo 预览" className="w-9 h-9 rounded-lg object-contain bg-white p-1" />
                      <button
                        onClick={() => {
                          setLogoDataUrl(null);
                          setLogoError(null);
                        }}
                        className="text-xs font-mono text-neutral-500 hover:text-red-400 transition-colors"
                      >
                        移除
                      </button>
                    </>
                  )}
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="批量内容" hint={`${batch.lines.length} / ${BATCH_MAX_LINES} 条 · 每行一条`}>
                <textarea
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={"https://example.com/1\nhttps://example.com/2\nhttps://example.com/3"}
                  className="w-full h-44 px-4 py-3 rounded-xl font-mono text-sm resize-none"
                />
              </Field>
              <div className="flex items-center justify-between">
                <Toggle checked={dedupe} onChange={setDedupe} label="去重" hint="忽略重复行" />
                <span className="text-[10px] font-mono text-neutral-600">每行 ≤ {QR_TEXT_MAX_CHARS} 字符</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="有效条数" value={batch.lines.length} tone="accent" />
                <Stat label="去重删除" value={batch.duplicatesRemoved} tone={batch.duplicatesRemoved > 0 ? "warn" : "default"} />
                <Stat label="超长跳过" value={batch.tooLongSkipped} tone={batch.tooLongSkipped > 0 ? "bad" : "default"} />
              </div>
              {batch.truncated && (
                <Hint kind="warn">内容超过 {BATCH_MAX_LINES} 条，仅生成前 {BATCH_MAX_LINES} 条，其余已忽略。</Hint>
              )}
              {batch.tooLongSkipped > 0 && (
                <Hint kind="error">有 {batch.tooLongSkipped} 行超过 {QR_TEXT_MAX_CHARS} 字符已被跳过，请缩短后重试。</Hint>
              )}
              {batch.duplicatesRemoved > 0 && (
                <Hint kind="info">已去重 {batch.duplicatesRemoved} 行重复内容。</Hint>
              )}
              {batch.lines.length === 0 && batchText.trim() !== "" && (
                <Hint kind="error">没有可生成的内容：所有行均为空、重复或超长。</Hint>
              )}
              {batchText.trim() === "" && (
                <Hint kind="info">每行一条内容，自动忽略空行，最多 {BATCH_MAX_LINES} 条。</Hint>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="尺寸" hint="128–512">
              <NumberInput value={size} onChange={(v) => setSize(v)} suffix="px" min={128} max={512} />
            </Field>
            <Field label="留白">
              <NumberInput value={margin} onChange={setMargin} suffix="格" min={0} max={8} />
            </Field>
          </div>

          <Field label="容错等级" hint="越高越抗污损，容量越小">
            <Segmented<"L" | "M" | "Q" | "H">
              value={level}
              onChange={setLevel}
              options={(["L", "M", "Q", "H"] as const).map((l) => ({ value: l, label: l }))}
            />
          </Field>
          {logoDataUrl && suggestedLevel !== level && (
            <Hint kind="warn">
              已添加 Logo，建议将容错等级提高至 {suggestedLevel} 以确保扫码成功率。
              <button
                onClick={() => setLevel(suggestedLevel)}
                className="ml-2 underline underline-offset-2 hover:text-amber-200"
              >
                改为 {suggestedLevel} 级
              </button>
            </Hint>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="前景色">
              <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="w-full h-11 rounded-xl bg-transparent cursor-pointer" />
            </Field>
            <Field label="背景色">
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-full h-11 rounded-xl bg-transparent cursor-pointer" />
            </Field>
          </div>
        </div>

        {/* 右侧：预览与导出 */}
        {mode === "single" ? (
          <div className="flex flex-col items-center justify-center gap-5">
            <div className="p-6 rounded-2xl border border-white/[0.06]" style={{ background: bg }}>
              {tooLong ? (
                <div className="w-[256px] text-center text-sm font-mono text-neutral-500">内容过长</div>
              ) : (
                <div ref={wrapRef} className="relative leading-none">
                  <QRCodeCanvas value={text} size={qrSize} marginSize={qrMargin} level={level} fgColor={fg} bgColor={bg} />
                  {logoDataUrl && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className="bg-white rounded-xl shadow-lg flex items-center justify-center overflow-hidden"
                        style={{ width: `${LOGO_SIZE_RATIO * 100}%`, aspectRatio: "1 / 1", padding: `${LOGO_PAD_RATIO * 100}%` }}
                      >
                        <img src={logoDataUrl} alt="Logo" className="w-full h-full object-contain" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {tooLong ? (
              <Hint kind="error">二维码内容建议不超过 {QR_TEXT_MAX_CHARS} 字符，请缩短文本。</Hint>
            ) : (
              <div className="w-full flex flex-col items-center gap-3">
                <button
                  onClick={() => void downloadPng()}
                  disabled={!text.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-mono hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  下载 PNG
                </button>
                {logoDataUrl && (
                  <Hint kind="warn">Logo 仅 PNG 导出支持，SVG 导出将不包含 Logo。</Hint>
                )}
                <div className="flex items-center gap-2">
                  <CopyButton text={svgText} label="复制 SVG" />
                  <button
                    onClick={downloadSvgFile}
                    disabled={!svgText || svgErrors.length > 0}
                    className="px-4 py-2 rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm font-mono text-neutral-300 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                  >
                    下载 .svg
                  </button>
                </div>
                {svgErrors.length > 0 && (
                  <Hint kind="error">SVG 导出校验未通过：{svgErrors.join("；")}</Hint>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => void downloadBatchAll()}
                disabled={batch.lines.length === 0 || progress !== null}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-mono hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {progress ? `下载中 ${progress.done}/${progress.total}` : "逐个下载全部"}
              </button>
              <span className="text-[10px] font-mono text-neutral-600 text-right leading-4">
                每张 {BATCH_PREVIEW_SIZE}px · 逐个触发下载
                <br />
                浏览器可能询问“允许下载多个文件”
              </span>
            </div>
            {batch.lines.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-1">
                {batch.lines.map((line, i) => (
                  <div
                    key={`${i}-${line}`}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]"
                  >
                    <QRCodeCanvas
                      ref={(el) => {
                        if (el) batchRefs.current.set(i, el);
                        else batchRefs.current.delete(i);
                      }}
                      value={line}
                      size={BATCH_PREVIEW_SIZE}
                      marginSize={qrMargin}
                      level={level}
                      fgColor={fg}
                      bgColor={bg}
                    />
                    <span className="w-full text-center text-[10px] font-mono text-neutral-500 truncate" title={line}>
                      {i + 1}. {line}
                    </span>
                    <button
                      onClick={() => void downloadBatchOne(i)}
                      className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      下载 PNG
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 隐藏的 SVG 渲染源：用于序列化导出 SVG 字符串 */}
      {!tooLong && text.trim() !== "" && (
        <div className="hidden" aria-hidden="true">
          <QRCodeSVG
            ref={svgRef}
            value={text}
            size={qrSize}
            marginSize={qrMargin}
            level={level}
            fgColor={fg}
            bgColor={bg}
          />
        </div>
      )}
    </div>
  );
}
