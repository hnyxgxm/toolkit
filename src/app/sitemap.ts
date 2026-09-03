import type { MetadataRoute } from "next";
import { ALL_TOOLS, absUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // W3C 要求 2005-02-21 或 2005-02-21T18:00:15+00:00，不带毫秒；toISOString 带 .xxxZ 会被 GSC 判“日期无效”→无法读取
  const now = new Date().toISOString().split(".")[0] + "Z";
  const entries = [
    { url: absUrl("/"), changeFrequency: "monthly" as const, priority: 1 },
    ...ALL_TOOLS.map((t) => ({
      url: absUrl(`/${t.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
  return entries.map((e) => ({
    url: e.url,
    lastModified: now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
