import { describe, it, expect } from "vitest";
import { escapeHtmlEntities, unescapeHtmlEntities, findUnclosedEntities } from "@/lib/htmlentity";

describe("escapeHtmlEntities", () => {
  it("escapes the minimal set with named entities (apostrophe as &#39;)", () => {
    expect(escapeHtmlEntities('<div class="a">b & c</div>')).toBe(
      "&lt;div class=&quot;a&quot;&gt;b &amp; c&lt;/div&gt;"
    );
    expect(escapeHtmlEntities("it's")).toBe("it&#39;s");
  });

  it("supports decimal and hex styles", () => {
    expect(escapeHtmlEntities(`<>&"'`, { style: "dec" })).toBe("&#60;&#62;&#38;&#34;&#39;");
    expect(escapeHtmlEntities(`<>&"'`, { style: "hex" })).toBe("&#x3C;&#x3E;&#x26;&#x22;&#x27;");
  });

  it("full mode escapes extended named entities", () => {
    expect(escapeHtmlEntities("a\u00a0b©", { full: true })).toBe("a&nbsp;b&copy;");
    expect(escapeHtmlEntities("—…", { full: true })).toBe("&mdash;&hellip;");
    // 非 full 模式下不转义扩展字符
    expect(escapeHtmlEntities("a\u00a0b©")).toBe("a\u00a0b©");
    // 最小集字符在全量模式下仍按最小集约定输出
    expect(escapeHtmlEntities("a & b", { full: true })).toBe("a &amp; b");
  });

  it("full mode with numeric styles escapes extended charset as numbers", () => {
    expect(escapeHtmlEntities("a\u00a0b©", { style: "dec", full: true })).toBe("a&#160;b&#169;");
    expect(escapeHtmlEntities("©", { style: "hex", full: true })).toBe("&#xA9;");
  });

  it("returns non-entity text unchanged and handles empty input", () => {
    expect(escapeHtmlEntities("plain 中文 123 ✓")).toBe("plain 中文 123 ✓");
    expect(escapeHtmlEntities("")).toBe("");
  });
});

describe("unescapeHtmlEntities", () => {
  it("decodes named, decimal and hex entities in one pass", () => {
    expect(unescapeHtmlEntities("&lt;p&gt;&amp;&quot;&#39;&apos;&nbsp;").text).toBe('<p>&"\'\'\u00a0');
    expect(unescapeHtmlEntities("&#65;&#x42;&#x1F600;").text).toBe("AB😀");
    // 单次解码不重复解析：&amp;lt; → &lt;（而非 <）
    expect(unescapeHtmlEntities("&amp;lt;").text).toBe("&lt;");
  });

  it("keeps unknown entities and bare ampersands untouched", () => {
    expect(unescapeHtmlEntities("&unknown;").text).toBe("&unknown;");
    expect(unescapeHtmlEntities("AT&T & T").text).toBe("AT&T & T");
    expect(unescapeHtmlEntities("5 < 6 & 7 > 4").text).toBe("5 < 6 & 7 > 4");
  });

  it("keeps unclosed entities by default and reports offsets", () => {
    const r = unescapeHtmlEntities("a &amp b &lt c");
    expect(r.text).toBe("a &amp b &lt c");
    expect(r.unclosed).toEqual([
      { entity: "&amp", offset: 2 },
      { entity: "&lt", offset: 9 },
    ]);
  });

  it("tolerant mode decodes unclosed entities (named and numeric)", () => {
    expect(unescapeHtmlEntities("a &amp b", { tolerant: true }).text).toBe("a & b");
    expect(unescapeHtmlEntities("&#65", { tolerant: true }).text).toBe("A");
    expect(unescapeHtmlEntities("&#x42", { tolerant: true }).text).toBe("B");
    // 容错模式同样上报位置，供 UI 提示
    expect(unescapeHtmlEntities("a &amp b", { tolerant: true }).unclosed).toEqual([{ entity: "&amp", offset: 2 }]);
  });

  it("rejects out-of-range code points by keeping them literal", () => {
    expect(unescapeHtmlEntities("&#x110000;").text).toBe("&#x110000;");
    expect(unescapeHtmlEntities("&#x110000;").unclosed).toEqual([]);
  });

  it("findUnclosedEntities is a pure detector", () => {
    expect(findUnclosedEntities("&copy no semi")).toEqual([{ entity: "&copy", offset: 0 }]);
    expect(findUnclosedEntities("&copy;")).toEqual([]);
  });
});

describe("round trip", () => {
  it("escape → unescape restores the original minimal-set text", () => {
    const src = '<a href="/x?y=1&z=2">标题 "引号" it\'s</a>';
    expect(unescapeHtmlEntities(escapeHtmlEntities(src)).text).toBe(src);
  });

  it("escape(dec,full) → unescape restores extended chars", () => {
    const src = "你好\u00a0© ±÷→";
    const enc = escapeHtmlEntities(src, { style: "dec", full: true });
    expect(unescapeHtmlEntities(enc).text).toBe(src);
  });
});
