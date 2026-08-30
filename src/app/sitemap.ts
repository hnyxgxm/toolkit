import type { MetadataRoute } from "next";
import { ALL_TOOLS, absUrl } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
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
