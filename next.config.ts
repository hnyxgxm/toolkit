import type { NextConfig } from "next";

/**
 * 站点部署在 GitHub 项目页子路径 https://hnyxgxm.github.io/toolkit/
 * 因此必须设置 basePath + assetPrefix，否则构建产物的路由/资源会指向根域导致 404。
 * （旧仓库缺失该配置 —— 这也是"仓库构建不出线上站点"的根因之一。）
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/toolkit",
  assetPrefix: "/toolkit",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
