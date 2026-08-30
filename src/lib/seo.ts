import type { Metadata } from "next";

/**
 * SEO 辅助：为每个工具页生成 metadata + JSON-LD。
 * 站点部署在项目页子路径 /toolkit，因此 canonical / sitemap 绝对 URL 需带 basePath。
 */
export const SITE_ORIGIN = "https://hnyxgxm.github.io";
export const BASE_PATH = "/toolkit";
export const SITE_NAME = "ToolKit 极客工具箱";

export function absUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${BASE_PATH}${p === "/" ? "" : p.replace(/\/$/, "")}/`;
}

/**
 * 全站默认分享图（1200×630）。文件位于 public/og.png，构建后可访问 /toolkit/og.png。
 * 注意：og.png 由主线程另行生成放入 public/，缺失时社交平台分享将无图（不影响构建）。
 */
export const OG_IMAGE = absUrl("/og.png");

export interface ToolSeo {
  slug: string;
  title: string; // 中文标题，如 "日期计算"
  subtitle: string; // 一句话功能
  description: string; // SEO 描述
  keywords: string[];
  ogImage?: string;
  /** FAQ / 说明，用于 JSON-LD */
  faqs?: Array<{ q: string; a: string }>;
}

export function toolMetadata(seo: ToolSeo): Metadata {
  const url = absUrl(`/${seo.slug}`);
  return {
    title: `${seo.title} - ${SITE_NAME}`,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: `${seo.title} - ${SITE_NAME}`,
      description: seo.description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "zh_CN",
      images: [
        {
          url: seo.ogImage ? absUrl(seo.ogImage) : OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${seo.title} - ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${seo.title} - ${SITE_NAME}`,
      description: seo.description,
      images: [seo.ogImage ? absUrl(seo.ogImage) : OG_IMAGE],
    },
  };
}

/** WebApplication 结构化数据 + FAQPage */
export function toolJsonLd(seo: ToolSeo): object {
  const url = absUrl(`/${seo.slug}`);
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${seo.title} - ${SITE_NAME}`,
    url,
    applicationCategory: "UtilityApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
    description: seo.description,
  };
  if (seo.faqs && seo.faqs.length) {
    return {
      "@context": "https://schema.org",
      "@graph": [
        app,
        {
          "@type": "FAQPage",
          mainEntity: seo.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      ],
    };
  }
  return app;
}

/** 集中登记所有工具的 SEO + 首页分组导航 */
export const TOOL_GROUPS: Array<{ group: string; items: ToolSeo[] }> = [
  {
    group: "开发者工具",
    items: [
      { slug: "json", title: "JSON 格式化", subtitle: "格式化 · 压缩 · 校验 · 智能诊断", description: "在线 JSON 格式化、压缩、校验工具，自动定位语法错误行号并给出中文修复建议，统计键数量、嵌套深度与体积。免费、无需注册、数据不上传。", keywords: ["JSON格式化", "JSON校验", "JSON压缩", "在线JSON工具"] },
      { slug: "base64", title: "Base64 编解码", subtitle: "文本 / 图片 双向转换", description: "在线 Base64 编码与解码工具，支持 UTF-8 中文文本与图片转 Base64 DataURI，自动识别编码方向。本地运算，隐私安全。", keywords: ["Base64编码", "Base64解码", "图片转Base64", "在线Base64"] },
      { slug: "html", title: "HTML 转义/反转义", subtitle: "实体编解码 · 特殊字符处理", description: "在线 HTML 实体转义与反转义工具，处理 &amp; &lt; &gt; &quot; 等特殊字符，适合模板、邮件、富文本场景。", keywords: ["HTML转义", "HTML反转义", "HTML实体", "特殊字符转义"] },
      { slug: "timestamp", title: "时间戳转换", subtitle: "Unix 秒/毫秒 ↔ 日期", description: "Unix 时间戳与日期时间互转工具，支持秒/毫秒自动识别、本地时区与 UTC、实时当前时间戳。", keywords: ["时间戳转换", "Unix时间戳", "timestamp", "时间戳转日期"] },
      { slug: "diff", title: "文本对比 Diff", subtitle: "逐行差异 · 新增/删除统计", description: "在线文本差异对比工具，逐行显示新增、删除、相同，支持行号与统计，适合代码、配置、文档比对。", keywords: ["文本对比", "在线diff", "代码对比", "文件差异"] },
      { slug: "markdown", title: "Markdown 预览", subtitle: "实时渲染 · 所见即所得", description: "在线 Markdown 编辑器与实时预览，支持标题、列表、代码块、表格、链接、图片等常用语法，可导出 HTML。", keywords: ["Markdown编辑器", "Markdown预览", "在线markdown", "md转html"] },
      { slug: "qr", title: "二维码生成", subtitle: "链接/文本转二维码 · 可调容错", description: "在线二维码生成器，将链接或文本转为二维码，支持尺寸、容错等级、前景背景色自定义，可下载 PNG。", keywords: ["二维码生成", "二维码生成器", "链接转二维码", "QR code"] },
    ],
  },
  {
    group: "日期与时间",
    items: [
      { slug: "date", title: "日期计算", subtitle: "天数差 · 工作日 · 加减", description: "日期差值与工作日计算器，明确区分含首/含尾口径，工作日自动跳过周末与法定节假日，支持从某日加减 N 个工作日。", keywords: ["日期计算", "天数计算", "工作日计算", "日期差", "日期计算器"], faqs: [{ q: "计算两个日期之间相差多少天，含不含起始日？", a: "工具提供『含首尾』和『不含结束日』两种口径开关，结果始终满足 总天数=工作日+周末，可自行选择符合你需求的口径。" }] },
      { slug: "weekday", title: "日期查星期", subtitle: "输入日期查星期几", description: "查询任意公历日期是星期几，覆盖闰年与历史日期，同时显示 ISO 周数与所在周区间。", keywords: ["星期查询", "万年历", "日期查星期", "今天是星期几"] },
      { slug: "holiday", title: "法定节假日", subtitle: "放假/补班安排 · 标注来源", description: "查询中国大陆法定节假日放假与补班安排，2025/2026 数据来自国务院办公厅通知，未公布年份只给确定事实不编造，并距下一个假期倒计时。", keywords: ["放假安排", "法定节假日", "2026放假", "调休", "补班"], faqs: [{ q: "2027年放假安排出来了吗？", a: "国务院通常在上年 11–12 月公布次年安排，2027 尚未发布。工具仅列出确定的法定节假日共 11 天，不编造具体调休日期。" }] },
    ],
  },
  {
    group: "生活计算",
    items: [
      { slug: "tax", title: "个税计算器", subtitle: "五险一金 · 个税 · 到手工资", description: "中国大陆工资个税计算器，支持多城市五险一金比例、社保基数上下限、专项附加扣除，清晰展示每一笔假设与计算过程。", keywords: ["个税计算", "工资计算器", "五险一金", "税后工资", "到手工资"], faqs: [{ q: "为什么默认用上海的比例？", a: "比例因城市而异且每年调整，工具默认上海仅为示例，可随时切换城市或自定义比例，实际请以参保地当年政策为准。" }] },
      { slug: "bmi", title: "BMI 计算器", subtitle: "身体质量指数 · 中国标准", description: "按中国成人标准计算 BMI 并分级（偏瘦/正常/超重/肥胖），给出健康体重区间，非法输入即时拦截不显示 NaN。", keywords: ["BMI计算", "身体质量指数", "BMI标准", "体重计算"] },
      { slug: "password", title: "密码生成器", subtitle: "高强度随机密码 · 熵评估", description: "使用浏览器加密级随机数生成安全密码，自定义长度与字符类型，保证各类字符至少出现一次，用信息熵量化强度。", keywords: ["密码生成器", "随机密码", "强密码", "安全密码"] },
    ],
  },
];

export const ALL_TOOLS: ToolSeo[] = TOOL_GROUPS.flatMap((g) => g.items);

export function findTool(slug: string): ToolSeo | undefined {
  return ALL_TOOLS.find((t) => t.slug === slug);
}

/** 顶栏紧凑标签：短、不换行，避免中文被竖排折断 */
const NAV_LABELS: Record<string, string> = {
  json: "JSON",
  base64: "Base64",
  html: "HTML",
  timestamp: "时间戳",
  diff: "Diff",
  markdown: "MD",
  qr: "二维码",
  date: "日期",
  weekday: "星期",
  holiday: "节假日",
  tax: "个税",
  bmi: "BMI",
  password: "密码",
};

export function navLabel(slug: string): string {
  return NAV_LABELS[slug] ?? slug;
}
