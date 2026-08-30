import { describe, it, expect } from "vitest";
import {
  analyzeJson,
  describeJsonParseError,
  buildJsonTree,
  escapeJsonString,
  unescapeJsonString,
} from "@/lib/json";

describe("json analyzer", () => {
  it("formats valid json and reports stats", () => {
    const r = analyzeJson('{"a":1,"b":[1,2]}', 2);
    expect(r.ok).toBe(true);
    expect(r.output).toContain('"a": 1');
    expect(r.stats?.keys).toBe(2);
    expect(r.stats?.arrays).toBe(1);
  });

  it("diagnoses trailing comma with suggestion", () => {
    const r = analyzeJson('{"a":1,}');
    expect(r.ok).toBe(false);
    expect(r.issues[0].type).toBe("error");
  });

  it("flags duplicate keys", () => {
    const r = analyzeJson('{"a":1,"a":2}');
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.message.includes("重复"))).toBe(true);
  });

  it("error issue carries line and column on invalid input", () => {
    const r = analyzeJson('{\n  "a": 1,\n  "b": ,\n}');
    expect(r.ok).toBe(false);
    const err = r.issues[0];
    expect(err.type).toBe("error");
    expect(err.line).toBe(3);
    expect(typeof err.column).toBe("number");
    expect(err.message).not.toMatch(/at position/i); // 已翻译为中文说明
  });
});

describe("json error locating (P0)", () => {
  it("maps old-format 'position N' messages to line/column", () => {
    const info = describeJsonParseError("abc\ndef,x", "Unexpected token , in JSON at position 8");
    expect(info.line).toBe(2);
    expect(info.column).toBe(5);
    expect(info.message).toContain("意外的符号");
    expect(info.raw).toContain("position 8");
  });

  it("computes line/column itself when only position is present (multiline)", () => {
    const info = describeJsonParseError('  \n  {"a":\n1,}', "Expected double-quoted property name in JSON at position 13");
    expect(info.line).toBe(3);
    expect(info.column).toBe(3);
    expect(info.message).toContain("属性名");
  });

  it("prefers position over embedded text that mentions position", () => {
    const info = describeJsonParseError('{"note":"at position 12",}', 'Unexpected token \'}\', "{"note":"at position 12",}" is not valid JSON');
    // 无 "in JSON at position"，走前缀扫描兜底，不应误取正文里的 "position 12"
    expect(info.line).toBe(1);
    expect(info.column).toBe(26); // 出错符号是下标 25 的 '}'（前面 25 个字符均合法可延展）
  });

  it("falls back to prefix scan for new-format messages without position", () => {
    const info = describeJsonParseError('{"a"::1}', 'Unexpected token \':\', "{"a"::1}" is not valid JSON');
    // 最长可延展前缀为 {"a": （长度 5），出错符号是下标 5 的第二个冒号
    expect(info.line).toBe(1);
    expect(info.column).toBe(6);
    expect(info.message).toContain("意外的符号");
  });

  it("handles Unexpected end of JSON input by pointing at the end", () => {
    const info = describeJsonParseError('{\n  "a": 1', "Unexpected end of JSON input");
    expect(info.line).toBe(2);
    expect(info.column).toBe(9); // 第二行（8 字符）行尾之后
    expect(info.message).toContain("输入意外结束");
  });

  it("translates common V8 messages into Chinese", () => {
    const cases: Array<[string, RegExp]> = [
      ["Unterminated string in JSON at position 7", /字符串未闭合/],
      ["Expected property name or '}' in JSON at position 1", /属性名/],
      ["Expected ':' after property name in JSON at position 5", /缺少冒号/],
      ["Expected ',' or '}' after property value in JSON at position 6", /缺少逗号/],
      ["Expected ',' or ']' after array element in JSON at position 4", /缺少逗号/],
      ["Bad escaped character in JSON at position 7", /转义字符/],
      ["Bad Unicode escape in JSON at position 6", /\\u 转义不合法/],
      ["No number after minus sign in JSON at position 2", /负号/],
      ["Exponent part is missing a number in JSON at position 7", /科学计数法/],
      ["Unexpected non-whitespace character after JSON at position 8", /多余内容/],
      ["Unexpected number in JSON at position 6", /数字/],
      ["Unexpected keyword in JSON at position 6", /true \/ false \/ null/],
    ];
    for (const [raw, re] of cases) {
      expect(describeJsonParseError("{}", raw).message).toMatch(re);
    }
  });

  it("attaches heuristic suggestions", () => {
    const info = describeJsonParseError("{'a':1}", "Expected property name or '}' in JSON at position 1");
    expect(info.suggestion).toContain("双引号");
    const cn = describeJsonParseError("{“a”:1}", "Expected property name or '}' in JSON at position 1");
    expect(cn.suggestion).toContain("中文引号");
  });
});

describe("json tree builder (P1)", () => {
  it("builds nested nodes with types, keys, previews and paths", () => {
    const r = buildJsonTree({ a: 1, b: [true, null], c: { d: "text" } });
    expect(r.truncated).toBe(false);
    const root = r.root!;
    expect(root.type).toBe("object");
    expect(root.id).toBe("$");
    expect(root.children.map((c) => c.key)).toEqual(["a", "b", "c"]);
    expect(root.children[0].type).toBe("number");
    expect(root.children[1].type).toBe("array");
    expect(root.children[1].children[1].type).toBe("null");
    expect(root.children[1].preview).toContain("2 项");
    expect(root.children[2].children[0].id).toBe("$.c.d");
    expect(root.children[1].children[0].id).toBe("$.b[0]");
  });

  it("copyText: raw string for strings, formatted JSON for containers", () => {
    const r = buildJsonTree({ s: "hi\n中文", n: 5, o: { x: 1 } });
    expect(r.root!.children[0].copyText).toBe("hi\n中文");
    expect(r.root!.children[1].copyText).toBe("5");
    expect(r.root!.children[2].copyText).toBe('{\n  "x": 1\n}');
  });

  it("string preview keeps JSON quoting and truncates long values", () => {
    const r = buildJsonTree({ long: "x".repeat(200) });
    expect(r.root!.children[0].preview.length).toBeLessThanOrEqual(81);
    expect(r.root!.children[0].preview.startsWith('"')).toBe(true);
  });

  it("truncates beyond maxNodes and flags it", () => {
    const big = Array.from({ length: 50 }, (_, i) => i);
    const r = buildJsonTree(big, 10);
    expect(r.truncated).toBe(true);
    expect(r.nodeCount).toBeLessThanOrEqual(10);
    expect(r.root!.children.length).toBeLessThan(50);
  });

  it("handles empty containers and array roots", () => {
    const r = buildJsonTree([[], {}, 0]);
    expect(r.root!.type).toBe("array");
    expect(r.root!.children[0].type).toBe("array");
    expect(r.root!.children[0].children).toHaveLength(0);
    expect(r.root!.children[0].preview).toContain("0 项");
    expect(r.root!.children[2].type).toBe("number");
  });
});

describe("json string escape / unescape", () => {
  it("round-trips tricky text", () => {
    const raw = 'a"b\\c\n中文\t✓ "quote"';
    const esc = escapeJsonString(raw);
    expect(esc).not.toContain("\n");
    const back = unescapeJsonString(esc);
    expect(back).toEqual({ ok: true, value: raw });
  });

  it("accepts quoted input as-is and bare escaped text", () => {
    expect(unescapeJsonString('"a\\"b"')).toEqual({ ok: true, value: 'a"b' });
    expect(unescapeJsonString("plain text")).toEqual({ ok: true, value: "plain text" });
    expect(unescapeJsonString("{\\\"a\\\":1}")).toEqual({ ok: true, value: '{"a":1}' });
    expect(unescapeJsonString("")).toEqual({ ok: true, value: "" });
  });

  it("rejects text that cannot be an escaped JSON string", () => {
    expect(unescapeJsonString('a"b"c').ok).toBe(false);
    expect(unescapeJsonString("bad\x01control").ok).toBe(false);
  });
});
