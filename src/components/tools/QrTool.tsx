"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { PageHeader, Field, NumberInput, Segmented, Hint } from "@/components/ui";

export default function QrTool() {
  const [text, setText] = useState("https://hnyxgxm.github.io/toolkit");
  const [size, setSize] = useState("256");
  const [margin, setMargin] = useState("2");
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [fg, setFg] = useState("#ffffff");
  const [bg, setBg] = useState("#0a0a0b");
  const wrapRef = useRef<HTMLDivElement>(null);

  const download = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "qrcode.png";
    a.click();
  };

  const tooLong = text.length > 2000;

  return (
    <div>
      <PageHeader badge="生成" title="二维码生成" subtitle="链接/文本 → 二维码 · 可调容错与颜色" tone="blue" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-5">
          <Field label="内容" hint={`${text.length} 字符`}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="输入链接或任意文本" className="w-full h-28 px-4 py-3 rounded-xl font-mono text-sm resize-none" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="尺寸" hint="128–512">
              <NumberInput value={size} onChange={(v) => setSize(v)} suffix="px" min={128} max={512} />
            </Field>
            <Field label="留白">
              <NumberInput value={margin} onChange={setMargin} suffix="格" min={0} max={8} />
            </Field>
          </div>
          <Field label="容错等级" hint="越高越抗污损，容量越小">
            <Segmented value={level} onChange={setLevel} options={(["L", "M", "Q", "H"] as const).map((l) => ({ value: l, label: l }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="前景色">
              <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="w-full h-11 rounded-xl bg-transparent cursor-pointer" />
            </Field>
            <Field label="背景色">
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-full h-11 rounded-xl bg-transparent cursor-pointer" />
            </Field>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-5">
          <div ref={wrapRef} className="p-6 rounded-2xl border border-white/[0.06]" style={{ background: bg }}>
            {tooLong ? (
              <div className="w-[256px] text-center text-sm font-mono text-neutral-500">内容过长</div>
            ) : (
              <QRCodeCanvas value={text} size={Number(size) || 256} marginSize={Number(margin) || 0} level={level} fgColor={fg} bgColor={bg} />
            )}
          </div>
          {tooLong ? (
            <Hint kind="error">二维码内容建议不超过 2000 字符，请缩短文本。</Hint>
          ) : (
            <button onClick={download} disabled={!text.trim()} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-mono hover:opacity-90 disabled:opacity-40 transition-opacity">
              下载 PNG
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
