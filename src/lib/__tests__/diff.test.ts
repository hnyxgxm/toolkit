import { describe, it, expect } from "vitest";
import { diffLines, diffText, MAX_LINES, type DiffLine } from "@/lib/diff";

/* ---------- 工具 ---------- */

// 固定种子 LCG（不用 Math.random，保证可复现）
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function linesOf(s: string): string[] {
  return s.split("\n");
}

function randLines(rng: () => number, count: number, poolSize: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`w${Math.floor(rng() * poolSize)}`);
  return out;
}

// 朴素 LCS 长度（经典两行滚动 DP，作为最优性对照基准）
function naiveLcsLen(a: string[], b: string[]): number {
  const m = b.length;
  let prev = new Uint32Array(m + 1);
  let cur = new Uint32Array(m + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    const t = prev;
    prev = cur;
    cur = t;
    cur.fill(0);
  }
  return prev[m];
}

/** 无损重建 + 守恒不变式：
 *  same+del 重建 a；same+add 重建 b；公共行数 = 原行数 - 删除 = 新行数 - 新增。 */
function checkInvariants(a: string[], b: string[], lines: DiffLine[]): { same: number; add: number; del: number } {
  const ra: string[] = [];
  const rb: string[] = [];
  let same = 0;
  let add = 0;
  let del = 0;
  for (const l of lines) {
    if (l.type === "same") {
      ra.push(l.text);
      rb.push(l.text);
      same++;
    } else if (l.type === "add") {
      rb.push(l.text);
      add++;
    } else {
      ra.push(l.text);
      del++;
    }
  }
  expect(ra).toEqual(a);
  expect(rb).toEqual(b);
  expect(same + del).toBe(a.length);
  expect(same + add).toBe(b.length);
  expect(2 * same + del + add).toBe(a.length + b.length);
  return { same, add, del };
}

/* ---------- 基础增删改 ---------- */

describe("diff 引擎：基础增删改", () => {
  it("追加：b 比 a 多出尾部行", () => {
    const r = diffLines(linesOf("a\nb\nc"), linesOf("a\nb\nc\nd\ne"));
    expect(r.map((l) => [l.type, l.text])).toEqual([
      ["same", "a"],
      ["same", "b"],
      ["same", "c"],
      ["add", "d"],
      ["add", "e"],
    ]);
  });

  it("删除：b 比 a 少尾部行（含中段删除，验证后缀裁剪）", () => {
    const r = diffLines(linesOf("a\nb\nc"), linesOf("a\nc"));
    expect(r.map((l) => [l.type, l.text])).toEqual([
      ["same", "a"],
      ["del", "b"],
      ["same", "c"],
    ]);
    const r2 = diffLines(linesOf("a\nb\nc\nd\ne"), linesOf("a\nb\nc"));
    expect(r2.map((l) => [l.type, l.text])).toEqual([
      ["same", "a"],
      ["same", "b"],
      ["same", "c"],
      ["del", "d"],
      ["del", "e"],
    ]);
  });

  it("替换：中间行被改写", () => {
    const r = diffLines(["x", "y"], ["x", "z"]);
    expect(r.map((l) => [l.type, l.text])).toEqual([
      ["same", "x"],
      ["del", "y"],
      ["add", "z"],
    ]);
  });

  it("头部插入对齐到最优脚本（旧实现回归用例）", () => {
    const r = diffLines(["c"], ["x", "c"]);
    expect(r.map((l) => [l.type, l.text])).toEqual([
      ["add", "x"],
      ["same", "c"],
    ]);
  });

  it("重复行与乱序对齐保持最优", () => {
    const r1 = diffLines(["x", "x", "y"], ["x", "y", "x"]);
    expect(checkInvariants(["x", "x", "y"], ["x", "y", "x"], r1).same).toBe(2);
    const r2 = diffLines(["1", "2", "3", "4", "5"], ["2", "3", "4", "5", "1"]);
    expect(checkInvariants(["1", "2", "3", "4", "5"], ["2", "3", "4", "5", "1"], r2).same).toBe(4);
  });
});

/* ---------- 三极值 ---------- */

describe("diff 引擎：三极值", () => {
  it("空数组输入", () => {
    expect(diffLines([], [])).toEqual([]);
    expect(diffLines([], ["x", "y"]).map((l) => [l.type, l.text])).toEqual([
      ["add", "x"],
      ["add", "y"],
    ]);
    expect(diffLines(["x"], []).map((l) => [l.type, l.text])).toEqual([["del", "x"]]);
  });

  it("diffText 空串按单空行处理（与旧组件行为一致）", () => {
    const r = diffText("", "");
    expect(r.trunc).toBe(false);
    expect(r.lines).toEqual([{ type: "same", text: "" }]);
    expect(r.stats).toEqual({ same: 1, add: 0, del: 0 });
  });

  it("完全相同：全部 same，无增删", () => {
    const a = linesOf("1\n2\n3");
    const r = diffLines(a, a.slice());
    const s = checkInvariants(a, a, r);
    expect(s).toEqual({ same: 3, add: 0, del: 0 });
  });

  it("完全不同：零公共行", () => {
    const r = diffLines(["a", "b"], ["x", "y", "z"]);
    const s = checkInvariants(["a", "b"], ["x", "y", "z"], r);
    expect(s).toEqual({ same: 0, add: 3, del: 2 });
  });
});

/* ---------- 随机不变式（固定种子 LCG） ---------- */

describe("diff 引擎：随机不变式（固定种子）", () => {
  it("随机小文本：与朴素 LCS 一致、对称且守恒", () => {
    const rng = makeRng(20240601);
    for (let t = 0; t < 300; t++) {
      const n = Math.floor(rng() * 41);
      const m = Math.floor(rng() * 41);
      const a = randLines(rng, n, 4);
      const b = randLines(rng, m, 4);
      const r = diffLines(a, b);
      const s = checkInvariants(a, b, r);
      expect(s.same).toBe(naiveLcsLen(a, b)); // 最优性：公共行数 = LCS 长度
      const r2 = diffLines(b, a);
      const s2 = checkInvariants(b, a, r2);
      expect(s2.same).toBe(s.same); // 对称性：公共行数一致
      expect(s.del).toBe(s2.add); // a→b 的删除行数 = b→a 的新增行数
      expect(s.add).toBe(s2.del);
    }
  });

  it("随机中等文本（更长行、更大字母表）：仍与朴素 LCS 一致", () => {
    const rng = makeRng(777777);
    for (let t = 0; t < 120; t++) {
      const n = Math.floor(rng() * 121);
      const m = Math.floor(rng() * 121);
      const a = randLines(rng, n, 8);
      const b = randLines(rng, m, 8);
      const r = diffLines(a, b);
      const s = checkInvariants(a, b, r);
      expect(s.same).toBe(naiveLcsLen(a, b));
    }
  });

  it("随机中大规模（走大路径混合分支）：结构不变式恒成立", () => {
    // 注：大路径的锚点分块是启发式，不保证最优，故此处只锁"无损重建 + 守恒"。
    const rng = makeRng(314159);
    for (let t = 0; t < 6; t++) {
      const uniqueMode = t % 2 === 0; // 偶数轮：唯一行（锚点分支）；奇数轮：小行池（Myers 分支）
      const n = 1200 + Math.floor(rng() * 400);
      const a: string[] = [];
      for (let i = 0; i < n; i++) a.push(uniqueMode ? `u${i}` : `p${Math.floor(rng() * 8)}`);
      const b: string[] = [];
      let bi = 5000;
      for (const line of a) {
        const r = rng();
        if (r < 0.04) continue; // 删除
        if (r < 0.09) {
          b.push(uniqueMode ? `u${bi++}` : `p${Math.floor(rng() * 8)}`); // 替换
          continue;
        }
        b.push(line);
      }
      const r = diffLines(a, b);
      checkInvariants(a, b, r);
    }
  });
});

/* ---------- 大路径（n*m > DP_LIMIT） ---------- */

describe("diff 引擎：大路径", () => {
  it("唯一行锚点分块：结果与朴素 LCS 一致", () => {
    const rng = makeRng(7);
    const n = 2000;
    const a: string[] = [];
    const b: string[] = [];
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const line = `unique-line-${i}`;
      a.push(line);
      if (i % 50 === 25) {
        b.push(`changed-${i}-${Math.floor(rng() * 1e9)}`);
        changed++;
      } else {
        b.push(line);
      }
    }
    const r = diffLines(a, b);
    const s = checkInvariants(a, b, r);
    expect(s.same).toBe(n - changed);
    expect(s.same).toBe(naiveLcsLen(a, b));
  });

  it("无唯一锚点（重复行池）走 Myers：完成时与朴素 LCS 一致", () => {
    const rng = makeRng(99);
    const pool = 12;
    const n = 2000;
    const a: string[] = [];
    for (let i = 0; i < n; i++) a.push(`p${Math.floor(rng() * pool)}`);
    const b = a.slice();
    for (let c = 0; c < 30; c++) {
      const idx = Math.floor(rng() * n);
      b[idx] = `p${Math.floor(rng() * pool)}`;
    }
    const r = diffLines(a, b);
    const s = checkInvariants(a, b, r);
    expect(s.same).toBe(naiveLcsLen(a, b));
  });

  it("随机中等规模 Myers 分支（编辑距离小）：与朴素 LCS 一致", () => {
    const rng = makeRng(24680);
    for (let t = 0; t < 4; t++) {
      const n = 1200 + Math.floor(rng() * 300);
      const a: string[] = [];
      for (let i = 0; i < n; i++) a.push(`p${Math.floor(rng() * 8)}`);
      const b = a.slice();
      for (let c = 0; c < 60; c++) {
        const idx = Math.floor(rng() * n);
        b[idx] = `p${Math.floor(rng() * 8)}`;
      }
      const r = diffLines(a, b);
      const s = checkInvariants(a, b, r);
      expect(s.same).toBe(naiveLcsLen(a, b));
    }
  });

  it("完全不同的大文本：预算内快速返回整块替换", () => {
    const n = 3000;
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < n; i++) {
      a.push(`A${i}`);
      b.push(`B${i}`);
    }
    const t0 = Date.now();
    const r = diffLines(a, b);
    const dt = Date.now() - t0;
    const s = checkInvariants(a, b, r);
    expect(s.same).toBe(0);
    expect(s.del).toBe(n);
    expect(s.add).toBe(n);
    expect(dt).toBeLessThan(3000);
  });
});

/* ---------- 截断 ---------- */

describe("diff 引擎：截断", () => {
  it("超过 MAX_LINES 返回 trunc 标记且仍给出前 MAX_LINES 行的结果（不静默丢弃）", () => {
    const n = MAX_LINES + 5000;
    const a: string[] = [];
    for (let i = 0; i < n; i++) a.push(`L${i}`);
    const b = a.slice();
    b[10] = "CHANGED";
    b.push("tail-1", "tail-2");
    const r = diffText(a.join("\n"), b.join("\n"));
    expect(r.trunc).toBe(true);
    checkInvariants(a.slice(0, MAX_LINES), b.slice(0, MAX_LINES), r.lines);
    expect(r.stats.del).toBe(1);
    expect(r.stats.add).toBe(1);
    expect(r.stats.same).toBe(MAX_LINES - 1);
  });

  it("未超限不标记截断；支持自定义 maxLines", () => {
    const ok = diffText("1\n2\n3", "1\n2\n4");
    expect(ok.trunc).toBe(false);
    const r = diffText("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12", "1\n2\n3", { maxLines: 10 });
    expect(r.trunc).toBe(true);
    checkInvariants(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      ["1", "2", "3"],
      r.lines,
    );
    expect(r.stats.del).toBe(7);
  });
});

/* ---------- 性能护栏 ---------- */

describe("diff 引擎：性能护栏（1 万行 vs 1 万行，宽松上限 3s）", () => {
  it("大量相似唯一行（锚点分块路径）", () => {
    const n = 10000;
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < n; i++) a.push(`line-${i}-content`);
    for (let i = 0; i < n; i++) b.push(i % 100 === 7 ? `changed-${i}` : a[i]);
    const t0 = Date.now();
    const r = diffLines(a, b);
    const dt = Date.now() - t0;
    const s = checkInvariants(a, b, r);
    expect(s.same).toBe(n - 100); // 修改行全新且唯一 → 最优公共行数确定
    expect(dt).toBeLessThan(3000);
  });

  it("大量相似重复行（Myers 路径）", () => {
    const n = 10000;
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < n; i++) a.push(`pool-${i % 100}`);
    for (let i = 0; i < n; i++) b.push(i % 97 === 13 ? `pool-${(i * 7 + 3) % 100}` : a[i]);
    const t0 = Date.now();
    const r = diffLines(a, b);
    const dt = Date.now() - t0;
    const s = checkInvariants(a, b, r);
    expect(s.del).toBeLessThanOrEqual(120);
    expect(s.add).toBeLessThanOrEqual(120);
    expect(dt).toBeLessThan(3000);
  });
});
