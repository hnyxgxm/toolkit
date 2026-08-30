import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("markdown gfm 表格", () => {
  it("渲染列数、表头与表体", () => {
    const html = renderMarkdown("| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |");
    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect((html.match(/<th /g) ?? []).length).toBe(3);
    expect((html.match(/<td /g) ?? []).length).toBe(6);
  });

  it("支持 :--- / :---: / ---: 三种对齐并落到 th 与 td", () => {
    const html = renderMarkdown("| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |");
    expect((html.match(/text-left/g) ?? []).length).toBe(2);
    expect((html.match(/text-center/g) ?? []).length).toBe(2);
    expect((html.match(/text-right/g) ?? []).length).toBe(2);
  });

  it("单元格内的 HTML 被转义（防 XSS 不回归）", () => {
    const html = renderMarkdown("| <script>alert(1)</script> | b |\n| --- | --- |");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("短行自动补齐列数", () => {
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 1 |");
    expect((html.match(/<td /g) ?? []).length).toBe(2);
  });

  it("支持 \\| 转义竖线", () => {
    const html = renderMarkdown("| a | b |\n| --- | --- |\n| x \\| y | 2 |");
    expect(html).toContain(">x | y</td>");
  });
});

describe("markdown 任务列表", () => {
  it("渲染 disabled checkbox 并区分勾选状态", () => {
    const html = renderMarkdown("- [ ] 待办\n- [x] 已完成\n- [X] 大写也算");
    expect(html).toContain('<input type="checkbox" disabled class="accent-blue-500 mr-1.5" />');
    expect((html.match(/<input type="checkbox" disabled checked class="accent-blue-500 mr-1.5" \/>/g) ?? []).length).toBe(2);
  });

  it("任务项与普通列表项可混排", () => {
    const html = renderMarkdown("- [x] 任务\n- 普通项");
    expect(html).toContain('<li class="list-none">');
    expect(html).toContain("<li>普通项</li>");
  });
});

describe("markdown 脚注", () => {
  it("引用与定义配对，编号按首次引用顺序", () => {
    const html = renderMarkdown("甲[^b] 乙[^a]\n\n[^a]: 注释A\n[^b]: 注释B");
    expect(html).toContain('<sup id="fnref-b"><a href="#fn-b"');
    expect(html).toContain('<sup id="fnref-a"><a href="#fn-a"');
    expect(html).toContain('id="fn-b"');
    expect(html).toContain('id="fn-a"');
    expect(html).toContain("注释A");
    expect(html).toContain("注释B");
    // b 先被引用 → b 的定义排在 a 前面
    expect(html.indexOf('id="fn-b"')).toBeLessThan(html.indexOf('id="fn-a"'));
    // 定义带回链
    expect(html).toContain('href="#fnref-b"');
  });

  it("未知脚注引用原样输出", () => {
    const html = renderMarkdown("未知引用 [^ghost] 没有定义");
    expect(html).toContain("[^ghost]");
    expect(html).not.toContain("fn-ghost");
  });

  it("未被引用的定义不渲染（GFM 行为）", () => {
    const html = renderMarkdown("正文\n\n[^1]: 从未被引用");
    expect(html).not.toContain("从未被引用");
  });
});

describe("markdown 代码块内不解析新语法", () => {
  it("围栏内的 | 不是表格", () => {
    const html = renderMarkdown("```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```");
    expect(html).not.toContain("<table");
    expect(html).toContain("| a | b |");
    expect(html).toContain("| --- | --- |");
  });

  it("围栏内不解析任务列表与脚注", () => {
    const html = renderMarkdown("```\n- [x] 不是任务\n[^1]: 不是脚注\n```");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('id="fn-1"');
    expect(html).toContain("- [x] 不是任务");
    expect(html).toContain("[^1]: 不是脚注");
  });

  it("行内代码中的 | 保持原样", () => {
    const html = renderMarkdown("行内 `a | b` 管道");
    expect(html).toContain("<code");
    expect(html).toContain("a | b");
    expect(html).not.toContain("<table");
  });
});

describe("markdown HTML 转义（XSS 防护不回归）", () => {
  it("正文中的 script 标签被转义", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("img onerror 被转义", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("链接 URL 中的引号不会造成属性逃逸", () => {
    const html = renderMarkdown('[x](https://a.com/"/onclick="alert(1))');
    expect(html).not.toContain('onclick="');
    expect(html).toContain('href="https://a.com/&quot;');
  });

  it("javascript: 协议被拒绝", () => {
    expect(renderMarkdown("[x](javascript:alert(1))")).toContain('href="#"');
  });
});

describe("markdown 综合文档", () => {
  it("表格/任务列表/脚注/代码块/自动链接混合渲染", () => {
    const html = renderMarkdown(
      [
        "# 报告",
        "",
        "- [x] 完成",
        "- [ ] 待办",
        "",
        "| 模块 | 状态 |",
        "| :--- | ---: |",
        "| 脚注[^note] | ok |",
        "",
        "自动链接 https://example.com/a",
        "",
        "```",
        "| 不是 | 表格 |",
        "```",
        "",
        "[^note]: 汇总说明",
      ].join("\n"),
    );
    expect(html).toContain("<table");
    expect(html).toContain('id="fn-note"');
    expect(html).toContain("汇总说明");
    expect(html).toContain('<input type="checkbox" disabled checked class="accent-blue-500 mr-1.5" />');
    expect(html).toContain('<a href="https://example.com/a"');
    expect((html.match(/<table/g) ?? []).length).toBe(1); // 代码块里的 | 不成表
    // 脚注汇总必须位于正文之后
    expect(html.indexOf('id="fn-note"')).toBeGreaterThan(html.indexOf("<table"));
  });
});

describe("markdown 行内补充语法", () => {
  it("删除线保持支持", () => {
    expect(renderMarkdown("~~废弃~~")).toContain("<del>废弃</del>");
  });

  it("裸 URL 自动链接并剥离尾部标点", () => {
    const html = renderMarkdown("访问 https://example.com/a。结束");
    expect(html).toContain('<a href="https://example.com/a"');
    expect(html).toContain("</a>。");
  });

  it("显式 <https://…> 自动链接", () => {
    expect(renderMarkdown("看 <https://example.com/x>")).toContain('<a href="https://example.com/x"');
  });
});
