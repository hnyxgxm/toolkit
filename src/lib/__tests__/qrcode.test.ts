import { describe, it, expect } from "vitest";
import {
  BATCH_MAX_LINES,
  LOGO_SIZE_RATIO,
  QR_TEXT_MAX_CHARS,
  ensureStandaloneSvg,
  logoBox,
  parseBatchLines,
  qrDownloadFileName,
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
