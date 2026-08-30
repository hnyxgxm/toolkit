import Link from "next/link";
import { TOOL_GROUPS } from "@/lib/seo";

const ICON: Record<string, string> = {
  json: "{ }", base64: "B64", html: "</>", timestamp: "⏱", diff: "⇄", markdown: "M↓", qr: "▦",
  date: "📅", weekday: "7", holiday: "🎎", tax: "¥", bmi: "⚖", password: "🔒",
};
const COLOR: Record<string, string> = {
  json: "from-amber-500 to-orange-400", base64: "from-emerald-500 to-teal-400", html: "from-purple-500 to-pink-400",
  timestamp: "from-rose-500 to-red-400", diff: "from-cyan-500 to-blue-400", markdown: "from-slate-400 to-neutral-500",
  qr: "from-blue-500 to-cyan-400", date: "from-indigo-500 to-blue-400", weekday: "from-sky-500 to-cyan-400",
  holiday: "from-red-500 to-orange-400", tax: "from-green-500 to-emerald-400", bmi: "from-fuchsia-500 to-pink-400",
  password: "from-violet-500 to-purple-400",
};

export default function Home() {
  return (
    <div>
      <section className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-xs font-mono text-neutral-500 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          免费 · 无需注册 · 全部本地运算
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          <span className="bg-gradient-to-r from-white via-white to-neutral-500 bg-clip-text text-transparent">
            极客工具箱
          </span>
        </h1>
        <p className="text-lg text-neutral-500 max-w-md mx-auto">
          13 个原子化在线工具，按 <span className="text-neutral-400">开发者 / 日期时间 / 生活计算</span> 三类整理
        </p>
      </section>

      {TOOL_GROUPS.map((group) => (
        <section key={group.group} className="mb-12">
          <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-600 mb-4">
            <span className="w-1 h-1 rounded-full bg-blue-500" />
            {group.group}
            <span className="text-neutral-800">· {group.items.length}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.items.map((t) => (
              <Link
                key={t.slug}
                href={`/${t.slug}`}
                className="group relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${COLOR[t.slug]} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xl font-bold font-mono text-white tracking-tighter w-9 text-center">{ICON[t.slug]}</span>
                    <span className="text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors">{t.title}</span>
                  </div>
                  <p className="text-sm text-neutral-500 group-hover:text-neutral-400 transition-colors">{t.subtitle}</p>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-mono text-neutral-600 group-hover:text-neutral-500 transition-colors">
                    <span>进入</span>
                    <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-16 text-center">
        <p className="text-xs font-mono text-neutral-700">built with simplicity &amp; correctness in mind</p>
      </div>
    </div>
  );
}
