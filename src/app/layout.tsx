import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ToolKit - 极客工具箱",
  description: "简洁到极致的在线工具：链接转二维码、HTML反转义、JSON格式化、Base64编解码、时间戳转换。完全免费，无需注册。",
  keywords: ["在线工具", "二维码生成", "JSON格式化", "Base64", "时间戳转换", "HTML反转义"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold group-hover:shadow-lg group-hover:shadow-blue-500/25 transition-shadow">
                T
              </div>
              <span className="font-semibold text-white tracking-tight">toolkit</span>
            </Link>
            <div className="flex items-center gap-1">
              {[
                { href: "/qr", label: "QR" },
                { href: "/json", label: "JSON" },
                { href: "/base64", label: "B64" },
                { href: "/html", label: "HTML" },
                { href: "/timestamp", label: "TIME" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-xs font-mono text-neutral-500 hover:text-white hover:bg-white/[0.05] rounded-md transition-all"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-20">
          {children}
        </main>
        <footer className="relative z-10 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-neutral-600 font-mono">
            <span>&copy; 2026 toolkit</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              all systems operational
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
