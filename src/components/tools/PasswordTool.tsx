"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, Field, NumberInput, Stat, Hint, Toggle, CopyButton } from "@/components/ui";
import { generatePassword, evaluateStrength, poolFor, type CharSets } from "@/lib/password";

const LABELS: Record<keyof CharSets, string> = {
  upper: "大写 A-Z",
  lower: "小写 a-z",
  digit: "数字 0-9",
  symbol: "符号 !@#",
};

export default function PasswordTool() {
  const [length, setLength] = useState("20");
  const [charsets, setCharsets] = useState<CharSets>({ upper: true, lower: true, digit: true, symbol: true });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | undefined>();

  const poolSize = useMemo(() => poolFor(charsets, excludeAmbiguous).length, [charsets, excludeAmbiguous]);
  const strength = useMemo(() => evaluateStrength(Number(length) || 0, poolSize), [length, poolSize]);

  const gen = useCallback(() => {
    const { password, error } = generatePassword({ length: Number(length), charsets, excludeAmbiguous });
    if (error) { setErr(error); setPwd(""); }
    else { setErr(undefined); setPwd(password); }
  }, [length, charsets, excludeAmbiguous]);

  useEffect(() => { gen(); }, [gen]);

  const strengthColor =
    strength.bits >= 120 ? "text-emerald-400" : strength.bits >= 80 ? "text-blue-400" : strength.bits >= 60 ? "text-amber-400" : "text-red-400";
  const barPct = Math.min(100, (strength.bits / 160) * 100);

  return (
    <div>
      <PageHeader badge="生活" title="密码生成器" subtitle="加密级随机 · 熵量化强度 · 保证各类字符出现" tone="violet" />

      {pwd && (
        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <code className="flex-1 text-lg font-mono text-white break-all select-all">{pwd}</code>
            <CopyButton text={pwd} label="复制" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className={`h-full transition-all`} style={{ width: `${barPct}%`, background: "linear-gradient(90deg,#ef4444,#f59e0b,#3b82f6,#10b981)" }} />
            </div>
            <span className={`text-xs font-mono ${strengthColor}`}>{strength.level} · {strength.bits} bit</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Field label="密码长度" hint="4–128">
          <div className="flex items-center gap-3">
            <input type="range" min={4} max={64} value={length} onChange={(e) => setLength(e.target.value)} className="flex-1 accent-blue-500" />
            <div className="w-20"><NumberInput value={length} onChange={setLength} min={4} max={128} /></div>
          </div>
        </Field>
        <div className="flex items-end">
          <button onClick={gen} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-mono hover:opacity-90 transition-opacity">
            重新生成
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(Object.keys(charsets) as Array<keyof CharSets>).map((k) => (
          <div key={k} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Toggle checked={charsets[k]} onChange={(v) => setCharsets({ ...charsets, [k]: v })} label={LABELS[k]} />
          </div>
        ))}
      </div>

      <div className="mb-6 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <Toggle checked={excludeAmbiguous} onChange={setExcludeAmbiguous} label="排除易混淆字符" hint="去掉 0O1lI，便于手输" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat label="字符池大小" value={poolSize} unit="种" />
        <Stat label="信息熵" value={strength.bits} unit="bit" />
        <Stat label="强度" value={strength.level} tone="default" />
      </div>

      {err && <div className="mt-4"><Hint kind="error">{err}</Hint></div>}
    </div>
  );
}
