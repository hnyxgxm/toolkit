/** 行级 Diff 引擎（纯函数：无 DOM、无 setTimeout/Worker，浏览器与 Node 均可运行）。
 *
 * 算法分层（只对裁剪后的中间差异段计算，杜绝 O(n²) 全量矩阵内存爆炸）：
 * 1. 先裁剪公共前缀/后缀；
 * 2. 中间段规模小（行数乘积 ≤ DP_LIMIT ≈ 1e6）→ 经典 LCS DP（最优解，回溯输出）；
 * 3. 规模大 → 唯一行锚点分块（patience 思想：在两侧各只出现一次的行中选
 *    最长递增锚点序列切分子问题，子问题继续走同一分派逻辑）；
 * 4. 仍无锚点 → Myers O(ND) 贪心（保存各层 V 快照回溯，D ≤ D_CAP 时精确最优）；
 * 5. 超出 D 上限 / 工作量预算 → 该块整体"删除+新增"（脚本仍可无损重建，仅非最优）。
 *
 * 输入超过 MAX_LINES 行时截断对比，并在结果上标记 trunc（诚实提示，不静默丢弃）。
 *
 * 结果不变式（单测锁定）：
 *   same + del === a 行数；same + add === b 行数；
 *   按序取 same+del 可无损重建 a，按序取 same+add 可无损重建 b。
 */

export type DiffLineType = "same" | "add" | "del";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffStats {
  same: number;
  add: number;
  del: number;
}

export interface DiffResult {
  lines: DiffLine[];
  stats: DiffStats;
  /** 任一输入超过 maxLines 行被截断时为 true */
  trunc: boolean;
}

/** 触发"文本过大，已截断对比"的行数上限 */
export const MAX_LINES = 50_000;

/** 中间段行数乘积 ≤ 该值时用经典 LCS DP（≈1e6 → 矩阵内存 ~4MB） */
const DP_LIMIT = 1_000_000;
/** Myers 精确求解的最大编辑距离 D（V 快照内存约 (D+1)²×4B ≈ 16MB） */
const MYERS_D_CAP = 2000;
/** 单次 Myers 调用的工作量上限（k 迭代 + 蛇形扩展步数） */
const MYERS_CALL_WORK = 60_000_000;
/** 整个 diff 的全局工作量预算（锚点扫描 + Myers），超出后降级为整块替换 */
const WORK_BUDGET = 120_000_000;

type Task =
  | { k: 0; x0: number; x1: number; y0: number; y1: number }
  | { k: 1; xi: number };

/** 核心序列 diff（纯函数）。输出按文档顺序的行序列，
 *  满足不变式：same+del === a.length，same+add === b.length。 */
export function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  // 行内容 → 整数 id：大路径上把字符串比较降为整数比较
  const ids = new Map<string, number>();
  const X: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = a[i];
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    X.push(id);
  }
  const Y: number[] = [];
  for (let j = 0; j < m; j++) {
    const s = b[j];
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    Y.push(id);
  }

  const out: DiffLine[] = [];
  const budget = { left: WORK_BUDGET };
  const stack: Task[] = [{ k: 0, x0: 0, x1: n, y0: 0, y1: m }];

  /** 经典 LCS DP（规模 nn*mm ≤ DP_LIMIT），回溯输出；
   *  回溯优先级与旧版组件一致（dp[i+1][j] >= dp[i][j+1] 时先输出删除行）。 */
  function dpEmit(x0: number, xe: number, y0: number, ye: number): void {
    const nn = xe - x0;
    const mm = ye - y0;
    const w = mm + 1;
    const dp = new Int32Array((nn + 1) * w);
    for (let i = nn - 1; i >= 0; i--) {
      const xi = X[x0 + i];
      const row = i * w;
      const below = row + w;
      for (let j = mm - 1; j >= 0; j--) {
        dp[row + j] =
          xi === Y[y0 + j]
            ? dp[below + j + 1] + 1
            : Math.max(dp[below + j], dp[row + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < nn && j < mm) {
      if (X[x0 + i] === Y[y0 + j]) {
        out.push({ type: "same", text: a[x0 + i] });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        out.push({ type: "del", text: a[x0 + i] });
        i++;
      } else {
        out.push({ type: "add", text: b[y0 + j] });
        j++;
      }
    }
    while (i < nn) {
      out.push({ type: "del", text: a[x0 + i] });
      i++;
    }
    while (j < mm) {
      out.push({ type: "add", text: b[y0 + j] });
      j++;
    }
  }

  /** 在 [x0,xe)×[y0,ye) 内找"两侧均只出现一次"的行作锚点，
   *  返回按 x 升序的 (xi, yi) 对。 */
  function findAnchors(x0: number, xe: number, y0: number, ye: number): Array<[number, number]> {
    const cx = new Map<number, number>();
    for (let i = x0; i < xe; i++) cx.set(X[i], (cx.get(X[i]) ?? 0) + 1);
    const cy = new Map<number, number>();
    for (let j = y0; j < ye; j++) cy.set(Y[j], (cy.get(Y[j]) ?? 0) + 1);
    const posY = new Map<number, number>();
    for (let j = y0; j < ye; j++) {
      const id = Y[j];
      if (cy.get(id) === 1 && !posY.has(id)) posY.set(id, j);
    }
    const pairs: Array<[number, number]> = [];
    for (let i = x0; i < xe; i++) {
      const id = X[i];
      if (cx.get(id) === 1) {
        const py = posY.get(id);
        if (py !== undefined) pairs.push([i, py]);
      }
    }
    return pairs;
  }

  /** 锚点对的 LIS（yi 严格递增），返回选中的 pairs 下标（升序）。 */
  function lisPairs(pairs: Array<[number, number]>): number[] {
    const nn = pairs.length;
    const tails: number[] = [];
    const prev = new Int32Array(nn).fill(-1);
    for (let i = 0; i < nn; i++) {
      const y = pairs[i][1];
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pairs[tails[mid]][1] < y) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) prev[i] = tails[lo - 1];
      if (lo === tails.length) tails.push(i);
      else tails[lo] = i;
    }
    const res: number[] = [];
    for (let t = tails.length ? tails[tails.length - 1] : -1; t >= 0; t = prev[t]) res.push(t);
    res.reverse();
    return res;
  }

  /** Myers O(ND) 贪心（保存各层 V 快照用于回溯）。成功时按文档顺序输出
   *  整段最优编辑脚本并返回 true；超出 D 上限 / 工作量预算返回 false
   *  （调用方降级为整块替换）。 */
  function myersEmit(x0: number, xe: number, y0: number, ye: number): boolean {
    const N = xe - x0;
    const M = ye - y0;
    const hist: Int32Array[] = [];
    let prev = new Int32Array(1);
    let work = 0;
    for (let d = 0; ; d++) {
      const cur = new Int32Array(2 * d + 1);
      let done = false;
      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (d === 0) {
          x = 0;
        } else if (k === -d || (k !== d && prev[k - 1 + (d - 1)] < prev[k + 1 + (d - 1)])) {
          x = prev[k + 1 + (d - 1)]; // 下移（对应新增）
        } else {
          x = prev[k - 1 + (d - 1)] + 1; // 右移（对应删除）
        }
        let y = x - k;
        while (x < N && y < M && X[x0 + x] === Y[y0 + y]) {
          x++;
          y++;
          work++;
        }
        cur[k + d] = x;
        if (x >= N && y >= M) {
          done = true;
          break;
        }
      }
      work += d + 1;
      hist.push(cur);
      if (done) break;
      if (d + 1 > MYERS_D_CAP || work > MYERS_CALL_WORK || budget.left - work <= 0) {
        budget.left -= work;
        return false;
      }
      prev = cur;
    }
    budget.left -= work;

    // 从快照回溯编辑脚本（逆序收集，最后正序输出）
    const ops: Array<{ t: 0 | 1 | 2; i: number; j: number }> = [];
    const D = hist.length - 1;
    let x = N;
    let k = N - M;
    for (let dd = D; dd >= 1; dd--) {
      const p = hist[dd - 1];
      const base = dd - 1;
      if (k === -dd || (k !== dd && p[k - 1 + base] < p[k + 1 + base])) {
        // 下移：新增 b[y0 + py]，蛇形段为 (px, py+1) → (x, y)
        const px = p[k + 1 + base];
        const py = px - (k + 1);
        for (let t = x - px - 1; t >= 0; t--) ops.push({ t: 0, i: x0 + px + t, j: y0 + py + 1 + t });
        ops.push({ t: 2, i: 0, j: y0 + py });
        x = px;
        k = k + 1;
      } else {
        // 右移：删除 a[x0 + px]，蛇形段为 (px+1, py) → (x, y)
        const px = p[k - 1 + base];
        const py = px - (k - 1);
        for (let t = x - px - 2; t >= 0; t--) ops.push({ t: 0, i: x0 + px + 1 + t, j: y0 + py + t });
        ops.push({ t: 1, i: x0 + px, j: 0 });
        x = px;
        k = k - 1;
      }
    }
    // d=0 的起始蛇形：(0,0) → (x, y)，k=0 故 x === y
    for (let t = x - 1; t >= 0; t--) ops.push({ t: 0, i: x0 + t, j: y0 + t });
    for (let t = ops.length - 1; t >= 0; t--) {
      const op = ops[t];
      if (op.t === 0) out.push({ type: "same", text: a[op.i] });
      else if (op.t === 1) out.push({ type: "del", text: a[op.i] });
      else out.push({ type: "add", text: b[op.j] });
    }
    return true;
  }

  /** 大路径规划：优先唯一行锚点分块；无锚点时 Myers，失败则整块替换。
   *  返回按文档顺序的后续任务（调用方逆序压栈，LIFO 保证全局输出有序）。 */
  function planBig(x0: number, xe: number, y0: number, ye: number): Task[] {
    const tasks: Task[] = [];
    let pairs: Array<[number, number]> | null = null;
    if (budget.left > (xe - x0) + (ye - y0)) {
      budget.left -= (xe - x0) + (ye - y0);
      pairs = findAnchors(x0, xe, y0, ye);
    }
    if (pairs && pairs.length > 0) {
      const sel = lisPairs(pairs);
      let px = x0;
      let py = y0;
      for (const idx of sel) {
        const ax = pairs[idx][0];
        const ay = pairs[idx][1];
        if (ax > px || ay > py) tasks.push({ k: 0, x0: px, x1: ax, y0: py, y1: ay });
        tasks.push({ k: 1, xi: ax });
        px = ax + 1;
        py = ay + 1;
      }
      if (xe > px || ye > py) tasks.push({ k: 0, x0: px, x1: xe, y0: py, y1: ye });
    } else if (!myersEmit(x0, xe, y0, ye)) {
      for (let i = x0; i < xe; i++) out.push({ type: "del", text: a[i] });
      for (let j = y0; j < ye; j++) out.push({ type: "add", text: b[j] });
    }
    return tasks;
  }

  /** 处理一个对齐区间：裁剪公共前/后缀后按规模分派。 */
  function processRange(x0: number, x1: number, y0: number, y1: number): void {
    // 公共前缀（直接输出）
    while (x0 < x1 && y0 < y1 && X[x0] === Y[y0]) {
      out.push({ type: "same", text: a[x0] });
      x0++;
      y0++;
    }
    // 公共后缀（先记录，排在中段任务之后输出）
    let s = 0;
    while (x1 - s > x0 && y1 - s > y0 && X[x1 - 1 - s] === Y[y1 - 1 - s]) s++;
    const xe = x1 - s;
    const ye = y1 - s;

    const tasks: Task[] = [];
    const nn = xe - x0;
    const mm = ye - y0;
    if (nn > 0 && mm > 0) {
      if (nn * mm <= DP_LIMIT) dpEmit(x0, xe, y0, ye);
      else for (const t of planBig(x0, xe, y0, ye)) tasks.push(t);
    } else if (nn > 0) {
      for (let i = x0; i < xe; i++) out.push({ type: "del", text: a[i] });
    } else if (mm > 0) {
      for (let j = y0; j < ye; j++) out.push({ type: "add", text: b[j] });
    }
    for (let i = xe; i < x1; i++) tasks.push({ k: 1, xi: i });
    for (let t = tasks.length - 1; t >= 0; t--) stack.push(tasks[t]);
  }

  while (stack.length > 0) {
    const task = stack.pop()!;
    if (task.k === 0) processRange(task.x0, task.x1, task.y0, task.y1);
    else out.push({ type: "same", text: a[task.xi] });
  }
  return out;
}

/** 文本级入口：按行拆分 → 超限截断（带 trunc 标记）→ diff → 统计。 */
export function diffText(aText: string, bText: string, opts?: { maxLines?: number }): DiffResult {
  const maxLines = Math.max(1, opts?.maxLines ?? MAX_LINES);
  const la = aText.split("\n");
  const lb = bText.split("\n");
  const trunc = la.length > maxLines || lb.length > maxLines;
  const a = trunc ? la.slice(0, maxLines) : la;
  const b = trunc ? lb.slice(0, maxLines) : lb;
  const lines = diffLines(a, b);
  let same = 0;
  let add = 0;
  let del = 0;
  for (const l of lines) {
    if (l.type === "same") same++;
    else if (l.type === "add") add++;
    else del++;
  }
  return { lines, stats: { same, add, del }, trunc };
}
