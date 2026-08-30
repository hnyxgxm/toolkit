"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, Field, NumberInput, Stat, Hint, Toggle, CopyButton, Segmented } from "@/components/ui";
import {
  generatePassword,
  generatePassphrase,
  estimateStrength,
  poolFor,
  ONLINE_GUESSES_PER_SEC,
  OFFLINE_GUESSES_PER_SEC,
  PASSPHRASE_WORDS,
  type CharSets,
} from "@/lib/password";

type Mode = "random" | "phrase";
type Sep = "-" | "_" | "." | " ";

const LABELS: Record<keyof CharSets, string> = {
  upper: "大写 A-Z",
  lower: "小写 a-z",
  digit: "数字 0-9",
  symbol: "符号 !@#",
};

const SEP_OPTIONS: Array<{ value: Sep; label: string }> = [
  { value: "-", label: "连字符 -" },
  { value: "_", label: "下划线 _" },
  { value: ".", label: "点 ." },
  { value: " ", label: "空格" },
];

const SCORE_BAR_COLOR = ["#ef4444", "#f97316", "#f59e0b", "#3b82f6", "#10b981"];
const SCORE_TEXT_COLOR = ["text-red-400", "text-red-400", "text-amber-400", "text-blue-400", "text-emerald-400"];
const SCORE_TONE = ["bad", "bad", "warn", "accent", "good"] as const;

export default function PasswordTool() {
  const [mode, setMode] = useState<Mode>("random");

  // 随机密码
  const [length, setLength] = useState("16");
  const [charsets, setCharsets] = useState<CharSets>({ upper: true, lower: true, digit: true, symbol: true });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | undefined>();

  // 口令短语
  const [wordCount, setWordCount] = useState(5);
  const [sep, setSep] = useState<Sep>("-");
  const [capitalize, setCapitalize] = useState(true);
  const [addNumber, setAddNumber] = useState(true);
  const [phrase, setPhrase] = useState("");

  // 批量（口令短语）
  const [batchCount, setBatchCount] = useState("5");
  const [batchList, setBatchList] = useState<string[]>([]);

  const genRandom = useCallback(() => {
    const { password, error } = generatePassword({ length: Number(length), charsets, excludeAmbiguous });
    if (error) {
      setErr(error);
      setPwd("");
    } else {
      setErr(undefined);
      setPwd(password);
    }
  }, [length, charsets, excludeAmbiguous]);

  const genPhrase = useCallback(() => {
    const { passphrase } = generatePassphrase({ words: wordCount, separator: sep, capitalize, addNumber });
    setPhrase(passphrase);
  }, [wordCount, sep, capitalize, addNumber]);

  useEffect(() => {
    if (mode === "random") genRandom();
    else genPhrase();
  }, [mode, genRandom, genPhrase]);

  const current = mode === "random" ? pwd : phrase;
  const strength = useMemo(() => estimateStrength(current), [current]);
  const poolSize = useMemo(() => poolFor(charsets, excludeAmbiguous).length, [charsets, excludeAmbiguous]);
  const noClass = !Object.values(charsets).some(Boolean);
  const qrLength = Math.min(64, Math.max(8, Math.round(Number(length)) || 16));

  const genBatch = () => {
    const n = Math.min(50, Math.max(1, Math.round(Number(batchCount)) || 5));
    const list: string[] = [];
    for (let i = 0; i < n; i++) {
      const { passphrase } = generatePassphrase({ words: wordCount, separator: sep, capitalize, addNumber });
      list.push(passphrase);
    }
    setBatchList(list);
  };

  const downloadBatchTxt = () => {
    if (batchList.length === 0) return;
    const blob = new Blob([batchList.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `passphrases-${batchList.length}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const barPct = current ? Math.min(100, Math.max((strength.score / 4) * 100, 6)) : 0;

  return (
    <div>
      <PageHeader
        badge="生活"
        title="密码生成器"
        subtitle="加密级随机 · 熵量化强度 · 口令短语 · 全程本地"
        tone="violet"
      />

      <div className="mb-6">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          ariaLabel="生成模式"
          options={[
            { value: "random", label: "随机密码" },
            { value: "phrase", label: "口令短语" },
          ]}
        />
      </div>

      {/* 结果卡 */}
      {current ? (
        <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <code className="flex-1 text-lg font-mono text-white break-all select-all">{current}</code>
            <CopyButton text={current} label="复制" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${barPct}%`, background: SCORE_BAR_COLOR[strength.score] }}
              />
            </div>
            <span className={`text-xs font-mono ${SCORE_TEXT_COLOR[strength.score]}`}>
              {strength.label} · {strength.bits} bit
            </span>
          </div>
        </div>
      ) : (
        err && (
          <div className="mb-6">
            <Hint kind="error">{err}</Hint>
          </div>
        )
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
        {/* 左侧：参数 */}
        <div className="space-y-5">
          {mode === "random" ? (
            <>
              <Field label="密码长度" hint={`${qrLength} 位 · 8–64`}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={8}
                    max={64}
                    value={qrLength}
                    onChange={(e) => setLength(e.target.value)}
                    className="flex-1 accent-violet-500"
                    aria-label="密码长度"
                  />
                  <div className="w-20">
                    <NumberInput value={length} onChange={setLength} min={8} max={64} />
                  </div>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(charsets) as Array<keyof CharSets>).map((k) => (
                  <div key={k} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <Toggle
                      checked={charsets[k]}
                      onChange={(v) => setCharsets({ ...charsets, [k]: v })}
                      label={LABELS[k]}
                    />
                  </div>
                ))}
              </div>
              {noClass && (
                <Hint kind="error">至少选择一种字符类型，否则无法生成密码。</Hint>
              )}

              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <Toggle
                  checked={excludeAmbiguous}
                  onChange={setExcludeAmbiguous}
                  label="排除易混字符"
                  hint="去掉 i l 1 L o 0 O，便于人工抄写"
                />
              </div>
            </>
          ) : (
            <>
              <Field label="单词数量" hint={`${wordCount} 词 · 每词 7 bit 熵`}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={4}
                    max={6}
                    value={wordCount}
                    onChange={(e) => setWordCount(Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                    aria-label="单词数量"
                  />
                  <span className="w-12 text-right text-sm font-mono text-neutral-300">{wordCount} 词</span>
                </div>
              </Field>

              <Field label="分隔符">
                <Segmented<Sep> value={sep} onChange={setSep} ariaLabel="分隔符" options={SEP_OPTIONS} />
              </Field>

              <div className="space-y-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <Toggle checked={capitalize} onChange={setCapitalize} label="首字母大写" hint="提升可读性" />
                <Toggle checked={addNumber} onChange={setAddNumber} label="附加两位随机数字" hint="再 +6 bit 熵" />
              </div>

              {/* 批量生成 */}
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">批量生成</span>
                  <div className="w-20">
                    <NumberInput value={batchCount} onChange={setBatchCount} min={1} max={50} suffix="条" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={genBatch}
                    className="px-4 py-2 rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm font-mono text-neutral-300 hover:bg-white/[0.06] transition-colors"
                  >
                    生成 {Math.min(50, Math.max(1, Math.round(Number(batchCount)) || 5))} 条
                  </button>
                  {batchList.length > 0 && (
                    <>
                      <CopyButton text={batchList.join("\n")} label="复制全部" />
                      <button
                        onClick={downloadBatchTxt}
                        className="px-4 py-2 rounded-xl border border-white/[0.06] bg-white/[0.03] text-sm font-mono text-neutral-300 hover:bg-white/[0.06] transition-colors"
                      >
                        下载 .txt
                      </button>
                    </>
                  )}
                </div>
                {batchList.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-lg bg-black/20 p-3 space-y-1">
                    {batchList.map((p, i) => (
                      <div key={`${i}-${p}`} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-neutral-600 w-6 text-right flex-shrink-0">{i + 1}.</span>
                        <span className="text-neutral-300 break-all flex-1">{p}</span>
                        <CopyButton text={p} label="复制" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <button
            onClick={mode === "random" ? genRandom : genPhrase}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-mono hover:opacity-90 transition-opacity"
          >
            重新生成
          </button>
        </div>

        {/* 右侧：强度评估 */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">强度评估</span>
              <span className={`text-xs font-mono ${current ? SCORE_TEXT_COLOR[strength.score] : "text-neutral-600"}`}>
                {current ? `${strength.score} / 4 · ${strength.label}` : "—"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="有效熵" value={current ? strength.bits : "—"} unit="bit" tone={current ? SCORE_TONE[strength.score] : "default"} />
              <Stat label="字符集熵（未惩罚）" value={current ? strength.rawBits : "—"} unit="bit" />
              <Stat
                label={`在线破解（${ONLINE_GUESSES_PER_SEC.toExponential(0).replace("e+", "×10^")} 次/秒）`}
                value={current ? strength.crackTime.online : "—"}
                tone="default"
              />
              <Stat
                label={`离线破解（${OFFLINE_GUESSES_PER_SEC.toExponential(0).replace("e+", "×10^")} 次/秒）`}
                value={current ? strength.crackTime.offline : "—"}
                tone="default"
              />
            </div>
            {mode === "random" && !noClass && (
              <p className="mt-3 text-[10px] font-mono text-neutral-600">
                字符池 {poolSize} 种 · 长度 {qrLength} 位 · 理论熵 {Math.round(qrLength * Math.log2(poolSize || 1))} bit
              </p>
            )}
            {mode === "phrase" && (
              <p className="mt-3 text-[10px] font-mono text-neutral-600">
                词表 {PASSPHRASE_WORDS.length} 词 · 每词 7 bit · {wordCount} 词 ≈ {wordCount * 7} bit 基础熵
              </p>
            )}
          </div>

          {strength.warnings.length > 0 && (
            <div className="space-y-2">
              {strength.warnings.map((w) => (
                <Hint key={w} kind="warn">
                  {w}
                </Hint>
              ))}
            </div>
          )}

          <Hint kind="info">
            强度为本地简化估算（字符集熵 + 重复/字典词惩罚启发式），非 zxcvbn 精度，仅供参考；破解时间按平均尝试一半搜索空间折算。
          </Hint>
        </div>
      </div>

      <footer className="mt-10 border-t border-white/[0.06] pt-4 flex items-center justify-center text-xs font-mono text-neutral-600">
        🔒 全部本地生成 · 不联网 · 不存储
      </footer>
    </div>
  );
}
