# ToolKit · 极客工具箱

13 个免费在线工具，打开就用：无需注册、无需下载，计算全部在浏览器本地完成。

**在线地址：<https://hnyxgxm.github.io/toolkit/>**

| 分类 | 工具 |
|---|---|
| 日期与假期 | [日期计算](https://hnyxgxm.github.io/toolkit/date/) · [工作日推算](https://hnyxgxm.github.io/toolkit/weekday/) · [法定节假日](https://hnyxgxm.github.io/toolkit/holiday/) |
| 钱与身体 | [个税测算](https://hnyxgxm.github.io/toolkit/tax/) · [BMI](https://hnyxgxm.github.io/toolkit/bmi/) |
| 开发者 | [JSON](https://hnyxgxm.github.io/toolkit/json/) · [Base64](https://hnyxgxm.github.io/toolkit/base64/) · [HTML 实体](https://hnyxgxm.github.io/toolkit/html/) · [时间戳](https://hnyxgxm.github.io/toolkit/timestamp/) · [Diff](https://hnyxgxm.github.io/toolkit/diff/) · [Markdown](https://hnyxgxm.github.io/toolkit/markdown/) |
| 其他 | [密码生成](https://hnyxgxm.github.io/toolkit/password/) · [二维码](https://hnyxgxm.github.io/toolkit/qr/) |

## 数据去哪了

你输入的内容不发往任何服务器——没有后端接口，所有换算都在本页面的 JavaScript 里跑完。
统计只有 Google Analytics 的匿名访问计数（页面浏览、滚动深度），用来判断哪个工具值得继续维护。

## 技术栈

Next.js 15 + React 19，`output: "export"` 静态导出，`basePath: "/toolkit"`，产物是纯静态文件，
托管在 GitHub Pages。没有服务端运行时，也没有数据库。

```bash
npm install
npm run dev      # http://localhost:3000/toolkit
npm run build    # 静态导出
npm run test     # vitest
npm run lint
```

## 许可

仓库内没有 LICENSE 文件，即 **保留所有权利**。
