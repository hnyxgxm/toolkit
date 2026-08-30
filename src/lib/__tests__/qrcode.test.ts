import { describe, it, expect } from "vitest";
import {
  BATCH_MAX_LINES,
  DEFAULT_QR_SETTINGS,
  LOGO_SIZE_RATIO,
  QR_CONTRAST_BAD,
  QR_CONTRAST_MIN,
  QR_TEXT_MAX_CHARS,
  contrastRatio,
  contrastRisk,
  ensureStandaloneSvg,
  logoBox,
  parseBatchLines,
  qrDownloadFileName,
  relativeLuminance,
  sanitizeQrSettings,
  suggestLevel,
  svgInvariantErrors,
} from "@/lib/qrcode";

const manyLines = (n: number) =>
  Array.from({ length: n }, (_, i) => `https://example.com/${i + 1}`).join("\n");

describe("parseBatchLines", () => {
  it("filters blank lines and trims whitespace", () => {
    const r = parseBatchLines("  https://a.com  \n\n\t\nhttps://b.com\n");
    expect(r.lines).toEqual(["https://a.com", "https://b.com"]);
    expect(r.blankSkipped).toBe(3);
    expect(r.truncated).toBe(false);
    expect(r.tooLongSkipped).toBe(0);
  });

  it("handles CRLF and CR line endings", () => {
    const r = parseBatchLines("a\r\nb\rc\n");
    expect(r.lines).toEqual(["a", "b", "c"]);
  });

  it("dedupe is optional and counts removed duplicates", () => {
    const raw = "a\nb\na\nb\na";
    const keep = parseBatchLines(raw);
    expect(keep.lines).toEqual(["a", "b", "a", "b", "a"]);
    expect(keep.duplicatesRemoved).toBe(0);
    const dedup = parseBatchLines(raw, { dedupe: true });
    expect(dedup.lines).toEqual(["a", "b"]);
    expect(dedup.duplicatesRemoved).toBe(3);
  });

  it("caps at 100 lines and flags truncation", () => {
    const r = parseBatchLines(manyLines(BATCH_MAX_LINES + 30));
    expect(r.lines).toHaveLength(BATCH_MAX_LINES);
    expect(r.truncated).toBe(true);
    expect(r.lines[0]).toBe("https://example.com/1");
  });

  it("custom maxLines truncates too", () => {
    const r = parseBatchLines("a\nb\nc\nd\ne", { maxLines: 3 });
    expect(r.lines).toEqual(["a", "b", "c"]);
    expect(r.truncated).toBe(true);
  });

  it("skips overlong lines instead of failing", () => {
    const long = "x".repeat(QR_TEXT_MAX_CHARS + 1);
    const r = parseBatchLines(`${long}\nshort`);
    expect(r.lines).toEqual(["short"]);
    expect(r.tooLongSkipped).toBe(1);
  });

  it("empty or blank-only input yields no lines", () => {
    expect(parseBatchLines("").lines).toEqual([]);
    expect(parseBatchLines("   \n\t\n").lines).toEqual([]);
  });
});

describe("suggestLevel", () => {
  it("suggests H whenever a logo is overlaid, keeps current otherwise", () => {
    expect(suggestLevel(true, "L")).toBe("H");
    expect(suggestLevel(true, "M")).toBe("H");
    expect(suggestLevel(true, "Q")).toBe("H");
    expect(suggestLevel(true, "H")).toBe("H");
    expect(suggestLevel(false, "M")).toBe("M");
  });
});

describe("logoBox", () => {
  it("backing occupies 20%-25% of the side and keeps inner margin for the logo", () => {
    for (const size of [128, 256, 384, 512]) {
      const { box, pad } = logoBox(size);
      const ratio = box / size;
      expect(ratio).toBeGreaterThanOrEqual(0.2);
      expect(ratio).toBeLessThanOrEqual(0.25);
      expect(pad * 2).toBeLessThan(box / 2); // logo 本体不被衬底挤没
      expect(box).toBeLessThanOrEqual(size);
    }
    expect(logoBox(256).box).toBe(Math.round(256 * LOGO_SIZE_RATIO));
  });

  it("guards invalid sizes without leaking NaN", () => {
    for (const bad of [0, -10, Number.NaN]) {
      const { box, pad } = logoBox(bad);
      expect(Number.isFinite(box)).toBe(true);
      expect(Number.isFinite(pad)).toBe(true);
      expect(box).toBeGreaterThan(0);
      expect(pad).toBeGreaterThan(0);
    }
  });
});

describe("qrDownloadFileName", () => {
  it("uses 1-based zero-padded index plus sanitized content summary", () => {
    expect(qrDownloadFileName(3, "https://github.com/toolkit")).toBe("qr-003-github-com-toolkit.png");
    expect(qrDownloadFileName(12, "https://a.b/c", "svg")).toBe("qr-012-a-b-c.svg");
  });

  it("falls back for invalid index or empty content (no NaN in name)", () => {
    expect(qrDownloadFileName(0, "abc").startsWith("qr-001-")).toBe(true);
    expect(qrDownloadFileName(Number.NaN, "abc").startsWith("qr-001-")).toBe(true);
    expect(qrDownloadFileName(1, "")).toBe("qr-001-text.png");
  });

  it("caps the summary length", () => {
    const name = qrDownloadFileName(1, `https://${"v".repeat(80)}.com`);
    expect(name.length).toBeLessThan(50);
  });
});

describe("svg export invariants", () => {
  // qrcode.react <QRCodeSVG> 序列化后的形态（两条 path：背景 + 模块）
  const componentSvg =
    '<svg width="256" height="256" viewBox="0 0 25 25" role="img">' +
    '<path fill="#ffffff" d="M0,0 h25v25H0z" shape-rendering="crispEdges"></path>' +
    '<path fill="#0a0a0b" d="M2,2h1v1h-1z" shape-rendering="crispEdges"></path>' +
    "</svg>";

  it("standalone svg keeps <svg> and path data, adds xmlns and xml declaration", () => {
    const out = ensureStandaloneSvg(componentSvg);
    expect(out).toContain("<svg");
    expect(out).toContain("<path");
    expect(out).toContain('d="M2,2h1v1h-1z"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out.startsWith("<?xml")).toBe(true);
    expect(svgInvariantErrors(out)).toEqual([]);
  });

  it("is idempotent (no duplicated xmlns or declaration)", () => {
    const once = ensureStandaloneSvg(componentSvg);
    const twice = ensureStandaloneSvg(once);
    expect(twice).toBe(once);
  });

  it("flags empty and broken svg strings", () => {
    expect(svgInvariantErrors("")).toContain("SVG 内容为空");
    expect(svgInvariantErrors("<div></div>").length).toBeGreaterThan(0);
    expect(svgInvariantErrors('<svg viewBox="0 0 1 1"><rect/></svg>').length).toBeGreaterThan(0);
    expect(svgInvariantErrors('<svg viewBox="0 0 1 1"><path d=""/></svg>').length).toBeGreaterThan(0);
  });
});

describe("qr color contrast (lib pure functions)", () => {
  it("relativeLuminance: black 0, white 1, mid-gray in between", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
    const gray = relativeLuminance("#808080");
    expect(gray).toBeGreaterThan(0.2);
    expect(gray).toBeLessThan(0.25);
  });

  it("relativeLuminance supports 3-digit hex and falls back to 0 on invalid input", () => {
    expect(relativeLuminance("#fff")).toBe(1);
    expect(relativeLuminance("not-a-color")).toBe(0);
    expect(relativeLuminance("")).toBe(0);
  });

  it("contrastRatio matches WCAG reference values and is order-independent", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#999999", "#ffffff")).toBeGreaterThan(2);
    expect(contrastRatio("#999999", "#ffffff")).toBeLessThan(3);
  });

  it("contrastRisk flags bad / warn / ok levels with messages", () => {
    expect(QR_CONTRAST_BAD).toBe(2);
    expect(QR_CONTRAST_MIN).toBe(3);

    const bad = contrastRisk("#777777", "#888888");
    expect(bad.level).toBe("bad");
    expect(bad.message).toContain("对比度过低");

    const warn = contrastRisk("#999999", "#ffffff");
    expect(warn.level).toBe("warn");
    expect(warn.message).toContain("对比度偏低");

    const ok = contrastRisk("#111111", "#ffffff");
    expect(ok.level).toBe("ok");
    expect(ok.message).toBeUndefined();
  });

  it("contrastRisk warns on inverted (light modules on dark background) colors", () => {
    const inv = contrastRisk("#ffffff", "#0a0a0b");
    expect(inv.inverted).toBe(true);
    // #0a0a0b 并非纯黑，比率约 19.8:1，仍远高于阈值
    expect(inv.ratio).toBeGreaterThan(19);
    expect(inv.level).toBe("ok");
    expect(inv.message).toContain("反色");

    const normal = contrastRisk("#111111", "#ffffff");
    expect(normal.inverted).toBe(false);
    expect(normal.message).toBeUndefined();
  });
});

describe("logoBox with custom ratio (logo size slider)", () => {
  it("honors custom ratio and clamps it into the geometric-safe range", () => {
    expect(logoBox(256, 0.3).box).toBe(Math.round(256 * 0.3));
    expect(logoBox(256, 0.9).box).toBe(Math.round(256 * 0.35)); // 上限钳制
    expect(logoBox(256, 0.01).box).toBe(Math.round(256 * 0.1)); // 下限钳制
    expect(logoBox(256, Number.NaN).box).toBe(Math.round(256 * LOGO_SIZE_RATIO)); // 非法回退默认
    expect(logoBox(256).box).toBe(Math.round(256 * LOGO_SIZE_RATIO)); // 默认行为不变
  });

  it("keeps a nonzero inner pad for any ratio", () => {
    for (const r of [0.1, 0.15, 0.22, 0.3, 0.35]) {
      const { box, pad } = logoBox(512, r);
      expect(box).toBeGreaterThan(0);
      expect(pad).toBeGreaterThan(0);
      expect(pad * 2).toBeLessThan(box / 2);
    }
  });
});

describe("qr settings persistence (localStorage params, no generated content)", () => {
  it("sanitizeQrSettings keeps valid values untouched", () => {
    const s = sanitizeQrSettings({ size: 384, margin: 4, level: "H", fg: "#123abc", bg: "#ffffff", logoScale: 0.25 });
    expect(s).toEqual({ size: 384, margin: 4, level: "H", fg: "#123abc", bg: "#ffffff", logoScale: 0.25 });
  });

  it("clamps out-of-range values and falls back for invalid ones", () => {
    const c = sanitizeQrSettings({ size: 9999, margin: -3, level: "X", fg: "red", bg: 123, logoScale: 5 });
    expect(c.size).toBe(512);
    expect(c.margin).toBe(0);
    expect(c.level).toBe("Q");
    expect(c.fg).toBe(DEFAULT_QR_SETTINGS.fg);
    expect(c.bg).toBe(DEFAULT_QR_SETTINGS.bg);
    expect(c.logoScale).toBe(0.3); // 离谱越界值钳制到上限 30%
    const small = sanitizeQrSettings({ logoScale: 0.01 });
    expect(small.logoScale).toBe(0.15); // 低于下限钳制到 15%
  });

  it("falls back to defaults for garbage input (null / string / undefined)", () => {
    expect(sanitizeQrSettings(null)).toEqual(DEFAULT_QR_SETTINGS);
    expect(sanitizeQrSettings(undefined)).toEqual(DEFAULT_QR_SETTINGS);
    expect(sanitizeQrSettings("junk")).toEqual(DEFAULT_QR_SETTINGS);
    expect(sanitizeQrSettings([1, 2])).toEqual(DEFAULT_QR_SETTINGS);
  });

  it("round-trips through JSON like localStorage would", () => {
    const s = sanitizeQrSettings({ size: 320, margin: 3, level: "M", fg: "#0a0a0b", bg: "#f5f5f5", logoScale: 0.2 });
    expect(sanitizeQrSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("defaults to level Q and dark-on-light colors", () => {
    expect(DEFAULT_QR_SETTINGS.level).toBe("Q");
    expect(relativeLuminance(DEFAULT_QR_SETTINGS.fg)).toBeLessThan(relativeLuminance(DEFAULT_QR_SETTINGS.bg));
  });
});
