import Link from "next/link";

/**
 * 全局 404 页（静态导出 output: "export" 下输出为 out/404.html，
 * GitHub Pages 对未命中路径自动回退到 404.html）。
 * App Router 的 not-found 渲染在根 layout 之内，因此不要写 <html>/<body>。
 * next/link 的 href 会自动带上 basePath（构建产物中 "/" → "/toolkit/"，静态 HTML 可直接点击）。
 */
export default function NotFound() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-xs font-mono text-neutral-500 mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
        HTTP 404
      </div>
      <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
        <span className="bg-gradient-to-r from-white via-white to-neutral-500 bg-clip-text text-transparent">
          页面不存在
        </span>
      </h1>
      <p className="text-lg text-neutral-500 max-w-md mx-auto mb-10">
        你访问的地址不存在或已被移动。
        <br />
        13 个在线工具都在首页，随时可以从头开始。
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-sm text-white font-medium hover:bg-white/[0.08] hover:border-white/[0.2] transition-all duration-300"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回首页
      </Link>
      <p className="mt-16 text-xs font-mono text-neutral-700">error 404 · page not found</p>
    </div>
  );
}
