import { describe, it, expect } from "vitest";
import {
  encodeBase64,
  encodeTextToBase64,
  decodeBase64,
  decodeBase64ToText,
  tryDecodeBase64,
  tryDecodeBase64ToText,
  parseDataUri,
  toDataUri,
  sniffMime,
  extForMime,
  isImageMime,
  base64ByteLength,
  formatBytes,
  findBase64Issue,
  Base64Error,
} from "@/lib/base64";

/** 确定性伪随机字节（LCG），避免依赖 Math.random */
function pseudoBytes(len: number, seed = 42): Uint8Array {
  let s = seed;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = s & 0xff;
  }
  return out;
}

describe("base64 codec", () => {
  it("matches known RFC vectors", () => {
    expect(encodeTextToBase64("hello")).toBe("aGVsbG8=");
    expect(encodeTextToBase64("A")).toBe("QQ==");
    expect(decodeBase64ToText("aGVsbG8=")).toBe("hello");
    expect(decodeBase64ToText("QQ==")).toBe("A");
  });

  it("handles UTF-8 Chinese and emoji round trip", () => {
    const samples = ["你好，世界", "中文 Base64 编码 🚀✓", "🎉👨‍👩‍👧‍👦 代理对组合", "混合 text 中文 123!@#\n换行\t制表"];
    for (const s of samples) {
      expect(decodeBase64ToText(encodeTextToBase64(s))).toBe(s);
    }
    expect(encodeTextToBase64("中")).toBe("5Lit");
    expect(decodeBase64ToText("5Lit")).toBe("中");
  });

  it("tolerates whitespace and missing padding on decode", () => {
    expect(decodeBase64ToText("aGVs bG8\n=")).toBe("hello");
    expect(decodeBase64ToText("SGVsbG8")).toBe("Hello"); // 无填充
  });

  it("round-trips arbitrary bytes exactly (padding edge cases included)", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 6, 7, 255, 256, 300]) {
      const bytes = pseudoBytes(len);
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
    expect(encodeBase64(new Uint8Array([1, 2, 3]))).toBe("AQID");
    expect(encodeBase64(new Uint8Array([1, 2]))).toBe("AQI=");
    expect(encodeBase64(new Uint8Array([1]))).toBe("AQ==");
    expect(encodeBase64(new Uint8Array(0))).toBe("");
  });

  it("supports URL-Safe variant round trip", () => {
    // 0xfb,0xef,0xff,0xff,0xff,0x41 的标准编码 "+/+///9A" 必然含 + 与 /
    const bytes = new Uint8Array([0xfb, 0xef, 0xff, 0xff, 0xff, 0x41]);
    const std = encodeBase64(bytes);
    expect(std).toContain("+");
    expect(std).toContain("/");
    const url = encodeBase64(bytes, true);
    expect(url).toBe("--____9B"); // + → -，/ → _，去填充
    expect(decodeBase64(url, { urlSafe: true })).toEqual(bytes);
    expect(decodeBase64(std)).toEqual(bytes);
  });

  it("invariant: encode(decode(x)) === x for canonical valid samples", () => {
    const canonical = [
      "QQ==",
      "AQI=",
      "AQID",
      "aGVsbG8=",
      "5Lit",
      "8J+OiQ==", // 🎉
      "SGVsbG8sIHdvcmxkIQ==",
      encodeBase64(pseudoBytes(1024, 99)),
    ];
    for (const x of canonical) {
      expect(encodeBase64(decodeBase64(x))).toBe(x);
    }
  });

  it("rejects invalid base64 with typed error, never returns garbage", () => {
    const invalid: Array<[string, RegExp]> = [
      ["ab$cd", /非法字符/],
      ["!!!", /非法字符/],
      ["中中中", /非法字符/],
      ["Q", /长度不正确/],
      ["QQ=Z", /只能出现在末尾/],
      ["QQ==Z", /只能出现在末尾/],
      ["AB=C", /只能出现在末尾/],
      ["QQ===", /数量非法/],
    ];
    for (const [input, msg] of invalid) {
      expect(() => decodeBase64(input)).toThrow(Base64Error);
      expect(() => decodeBase64(input)).toThrow(msg);
    }
  });

  it("try* wrappers report errors without throwing", () => {
    const r1 = tryDecodeBase64("ab$cd");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.message).toContain("非法字符");

    const r2 = tryDecodeBase64ToText("Q");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.message).toContain("长度不正确");

    const r3 = tryDecodeBase64("aGVsbG8=");
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(Array.from(r3.value)).toEqual([104, 101, 108, 108, 111]);
  });
});

describe("strict validation with error offset (P1)", () => {
  it("returns null for valid input including whitespace / no padding / url-safe", () => {
    expect(findBase64Issue("aGVsbG8=")).toBeNull();
    expect(findBase64Issue("aGVs bG8\n=")).toBeNull();
    expect(findBase64Issue("SGVsbG8")).toBeNull();
    expect(findBase64Issue("")).toBeNull();
    expect(findBase64Issue("--____9B", { urlSafe: true })).toBeNull();
    expect(findBase64Issue("aGVs\n\tbG8\r\n=")).toBeNull();
  });

  it("locates the first illegal character in the raw input", () => {
    const iss = findBase64Issue("aGV\n$sbG8=");
    expect(iss).not.toBeNull();
    expect(iss!.offset).toBe(4);
    expect(iss!.char).toBe("$");
    expect(iss!.message).toContain("非法");
    expect(iss!.message).toContain("$");
  });

  it("flags padding misuse at exact offsets", () => {
    expect(findBase64Issue("QQ=Z")!.offset).toBe(3);
    expect(findBase64Issue("QQ=Z")!.message).toContain("只能出现在末尾");
    expect(findBase64Issue("QQ==Z")!.offset).toBe(4);
    expect(findBase64Issue("QQ===")!.offset).toBe(4);
    expect(findBase64Issue("QQ===")!.message).toContain("最多 2 个");
  });

  it("flags bad length at the last data character", () => {
    const iss = findBase64Issue("aGVs Q");
    expect(iss).not.toBeNull();
    expect(iss!.offset).toBe(5);
    expect(iss!.message).toContain("长度不正确");
  });

  it("rejects url-safe characters when standard variant is expected", () => {
    const iss = findBase64Issue("AB-_cd");
    expect(iss!.offset).toBe(2);
    expect(iss!.char).toBe("-");
    expect(findBase64Issue("AB-_cd", { urlSafe: true })).toBeNull();
  });

  it("stays consistent with decodeBase64 on the shared test corpus", () => {
    const corpus = ["ab$cd", "!!!", "Q", "QQ=Z", "QQ==Z", "AB=C", "QQ===", "aGVsbG8=", "中中中"];
    for (const input of corpus) {
      const issue = findBase64Issue(input);
      let throws = false;
      try {
        decodeBase64(input);
      } catch {
        throws = true;
      }
      expect(!!issue).toBe(throws);
    }
  });
});

describe("dataURI parsing", () => {
  it("extracts mime and base64 payload", () => {
    expect(parseDataUri("data:image/png;base64,iVBORw0KGgo=")).toEqual({
      mime: "image/png",
      base64: "iVBORw0KGgo=",
    });
  });

  it("lowercases mime, keeps empty mime, supports extra params", () => {
    expect(parseDataUri("DATA:Image/PNG;base64,QQ==")?.mime).toBe("image/png");
    expect(parseDataUri("data:;base64,QQ==")).toEqual({ mime: "", base64: "QQ==" });
    expect(parseDataUri("data:text/plain;charset=utf-8;base64,5Lit")?.mime).toBe("text/plain");
  });

  it("returns null for non-base64 dataURI or plain text", () => {
    expect(parseDataUri("data:text/plain,hello")).toBeNull();
    expect(parseDataUri("data:image/svg+xml,<svg/>")).toBeNull();
    expect(parseDataUri("QQ==")).toBeNull();
    expect(parseDataUri("")).toBeNull();
  });

  it("toDataUri defaults to octet-stream when mime empty", () => {
    expect(toDataUri("image/png", "QQ==")).toBe("data:image/png;base64,QQ==");
    expect(toDataUri("", "QQ==")).toBe("data:application/octet-stream;base64,QQ==");
  });
});

describe("magic bytes sniffing", () => {
  it("detects png / jpg / gif / pdf / zip / webp / bmp / gzip / ico", () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toBe("application/zip");
    expect(sniffMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffMime(new Uint8Array([0x42, 0x4d, 0x36, 0x00]))).toBe("image/bmp");
    expect(sniffMime(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))).toBe("application/gzip");
    expect(sniffMime(new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01]))).toBe("image/x-icon");
  });

  it("falls back to octet-stream for unknown / empty / text data", () => {
    expect(sniffMime(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array([0x00, 0x01, 0x02]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array(0))).toBe("application/octet-stream");
    // 截断的 magic 不足以判定
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBe("application/octet-stream");
  });
});

describe("helpers", () => {
  it("base64ByteLength matches real decoded size", () => {
    for (const len of [0, 1, 2, 3, 10, 100, 1024, 4097]) {
      const bytes = pseudoBytes(len);
      expect(base64ByteLength(encodeBase64(bytes))).toBe(len);
    }
    // 含空白与 dataURI 头部之外场景：仅按 base64 段估算
    expect(base64ByteLength("aGVs bG8\n=")).toBe(5);
  });

  it("extForMime / isImageMime", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("application/pdf")).toBe("pdf");
    expect(extForMime("application/octet-stream")).toBe("bin");
    expect(extForMime("font/woff2")).toBe("bin");
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
  });

  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});
