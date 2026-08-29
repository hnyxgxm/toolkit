import Link from "next/link";

const tools = [
  {
    href: "/qr",
    title: "QR",
    desc: "链接 → 二维码",
    tag: "生成",
    color: "from-blue-500 to-cyan-400",
  },
  {
    href: "/json",
    title: "JSON",
    desc: "格式化 / 压缩 / 校验",
    tag: "解析",
    color: "from-amber-500 to-orange-400",
  },
  {
    href: "/base64",
    title: "B64",
    desc: "编码 / 解码",
    tag: "转换",
    color: "from-emerald-500 to-teal-400",
  },
  {
    href: "/html",
    title: "HTML",
    desc: "实体反转义",
    tag: "解码",
    color: "from-purple-500 to-pink-400",
  },
  {
    href: "/timestamp",
    title: "TIME",
    desc: "时间戳 ↔ 可读时间",
    tag: "转换",
    color: "from-rose-500 to-red-400",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-xs font-mono text-neutral-500 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          免费 · 无需注册 · 开箱即用
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          <span className="bg-gradient-to-r from-white via-white to-neutral-500 bg-clip-text text-transparent">
            极客工具箱
          </span>
        </h1>
        <p className="text-lg text-neutral-500 max-w-md mx-auto">
          为开发者打造的
          <span className="text-neutral-400">原子化</span>
          在线工具集
        </p>
      </div>

      {/* 工具卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool, i) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 overflow-hidden"
          >
            {/* 悬浮光效 */}
            <div className={`absolute inset-0 bg-gradient-to-br ${tool.color} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`} />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-2xl font-bold font-mono text-white tracking-tighter">
                  {tool.title}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-neutral-500 border border-white/[0.06] bg-white/[0.03]">
                  {tool.tag}
                </span>
              </div>
              <p className="text-sm text-neutral-500 group-hover:text-neutral-400 transition-colors">
                {tool.desc}
              </p>
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

      {/* 底部装饰 */}
      <div className="mt-20 text-center">
        <p className="text-xs font-mono text-neutral-700">
          built with simplicity in mind
        </p>
      </div>
    </div>
  );
}
