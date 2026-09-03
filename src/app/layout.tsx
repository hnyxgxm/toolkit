import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ALL_TOOLS, navLabel, SITE_ORIGIN, BASE_PATH, OG_IMAGE } from "@/lib/seo";
import { DesktopNavLinks, MobileNav, type NavItem } from "@/components/ui";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const NAV_ITEMS: NavItem[] = ALL_TOOLS.map((t) => ({
  slug: t.slug,
  label: navLabel(t.slug),
  title: t.title,
}));

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-XXXXXXXXXX";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ToolKit - 极客工具箱",
  url: SITE_ORIGIN + BASE_PATH + "/",
  description: "简洁到极致的免费在线工具箱：日期计算、法定节假日、个税测算、BMI、密码生成，以及 JSON、Base64、HTML、时间戳、Diff、Markdown、二维码等开发者工具。全部本地运算，无需注册。",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web Browser",
  offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN + BASE_PATH),
  title: {
    default: "ToolKit - 极客工具箱",
    template: "%s",
  },
  description:
    "简洁到极致的免费在线工具箱：日期计算、法定节假日、个税测算、BMI、密码生成，以及 JSON、Base64、HTML、时间戳、Diff、Markdown、二维码等开发者工具。全部本地运算，无需注册。",
  keywords: [
    "在线工具", "免费工具箱", "日期计算", "个税计算器", "法定节假日", "BMI", "密码生成器",
    "JSON格式化", "Base64", "时间戳转换", "文本对比", "二维码生成",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "ToolKit - 极客工具箱",
    description: "13 个免费在线工具：日期、节假日、个税、BMI、密码、JSON、Base64、Diff 等。",
    url: SITE_ORIGIN + BASE_PATH,
    siteName: "ToolKit",
    type: "website",
    locale: "zh_CN",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "ToolKit 极客工具箱" }],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
          }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#0a0a0b]/80 backdrop-blur-xl">
          <div className="w-full px-4 sm:px-6 lg:px-10 2xl:px-64 h-14 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 group shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold group-hover:shadow-lg group-hover:shadow-blue-500/25 transition-shadow">
                T
              </div>
              <span className="font-semibold text-white tracking-tight">toolkit</span>
            </Link>
            {/* 桌面端：13 个链接横滚，shrink-0 + whitespace-nowrap 防折行 */}
            <DesktopNavLinks items={NAV_ITEMS} />
            {/* 移动端：抽屉导航 */}
            <MobileNav items={NAV_ITEMS} />
          </div>
        </nav>
        <main className="relative z-10 w-full px-4 sm:px-6 lg:px-10 2xl:px-64 pt-24 pb-20">
          {children}
        </main>
        <footer className="relative z-10 border-t border-white/[0.06]">
          <div className="w-full px-4 sm:px-6 lg:px-10 2xl:px-64 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600 font-mono">
            <span>© 2026 toolkit · 全部本地运算，数据不上传</span>
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
