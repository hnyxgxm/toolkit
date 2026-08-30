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
  /** 该行在原始 A 序列中的下标（0 基；same/del 行存在） */
  aIdx?: number;
  /** 该行在原始 B 序列中的下标（0 基；same/add 行存在） */
  bIdx?: number;
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

/** 文本级入口：按行拆分 → 超限截断（带 trunc 标记）→ diff → 统计。
 *  输出行附带 aIdx/bIdx（原始行下标），供双栏视图显示行号。 */
export function diffText(aText: string, bText: string, opts?: { maxLines?: number }): DiffResult {
  return diffTextWithOptions(aText, bText, opts);
}

/* ---------- 忽略选项（归一化比较，映射回原行） ---------- */

export interface DiffOptions {
  /** 忽略大小写（仅用于比较，展示仍为原文） */
  ignoreCase?: boolean;
  /** 忽略行尾空白 */
  ignoreTrailingWs?: boolean;
  /** 忽略空行（两侧的空行 / 纯空白行不参与对比） */
  ignoreBlankLines?: boolean;
}

/** 单行归一化：仅用于比较，不改写展示文本 */
export function normalizeLine(line: string, opts: Pick<DiffOptions, "ignoreCase" | "ignoreTrailingWs">): string {
  let t = line;
  if (opts.ignoreTrailingWs) t = t.replace(/\s+$/, "");
  if (opts.ignoreCase) t = t.toLowerCase();
  return t;
}

/** 把 diff 输出映射回原始行：same/del 取 A 侧原文、add 取 B 侧原文，
 *  并按 diffLines 的输出顺序消耗两侧下标（其不变式保证映射无损），随后统计。 */
function finishDiff(
  raw: DiffLine[],
  aRaw: string[],
  bRaw: string[],
  mapA: number[],
  mapB: number[],
  trunc: boolean,
): DiffResult {
  let ia = 0;
  let ib = 0;
  let same = 0;
  let add = 0;
  let del = 0;
  const lines = raw.map((l): DiffLine => {
    if (l.type === "same") {
      const ai = mapA[ia++];
      const bi = mapB[ib++];
      same++;
      return { type: "same", text: aRaw[ai], aIdx: ai, bIdx: bi };
    }
    if (l.type === "del") {
      const ai = mapA[ia++];
      del++;
      return { type: "del", text: aRaw[ai], aIdx: ai };
    }
    const bi = mapB[ib++];
    add++;
    return { type: "add", text: bRaw[bi], bIdx: bi };
  });
  return { lines, stats: { same, add, del }, trunc };
}

/** 带"忽略"选项的文本 diff：先归一化 + 可选剔除空行（保留到原始行的下标映射），
 *  对归一化序列做 diff，再把结果映射回原始行文本与行号。
 *  开关切换即本地重算；same 行的展示文本取 A 侧原文（行号映射仍指向两侧原行）。 */
export function diffTextWithOptions(
  aText: string,
  bText: string,
  opts?: DiffOptions & { maxLines?: number },
): DiffResult {
  const maxLines = Math.max(1, opts?.maxLines ?? MAX_LINES);
  const ignoreCase = opts?.ignoreCase ?? false;
  const ignoreTrailingWs = opts?.ignoreTrailingWs ?? false;
  const ignoreBlankLines = opts?.ignoreBlankLines ?? false;
  const la = aText.split("\n");
  const lb = bText.split("\n");
  const trunc = la.length > maxLines || lb.length > maxLines;
  const aRaw = trunc ? la.slice(0, maxLines) : la;
  const bRaw = trunc ? lb.slice(0, maxLines) : lb;

  const cmpOpt = { ignoreCase, ignoreTrailingWs };
  const na: string[] = [];
  const nb: string[] = [];
  const mapA: number[] = [];
  const mapB: number[] = [];
  for (let i = 0; i < aRaw.length; i++) {
    const n = normalizeLine(aRaw[i], cmpOpt);
    if (ignoreBlankLines && n.trim() === "") continue;
    na.push(n);
    mapA.push(i);
  }
  for (let j = 0; j < bRaw.length; j++) {
    const n = normalizeLine(bRaw[j], cmpOpt);
    if (ignoreBlankLines && n.trim() === "") continue;
    nb.push(n);
    mapB.push(j);
  }
  return finishDiff(diffLines(na, nb), aRaw, bRaw, mapA, mapB, trunc);
}

/* ---------- 词级 diff（成对变更行的行内二次高亮） ---------- */

export interface WordSeg {
  text: string;
  changed: boolean;
}

export interface WordDiffResult {
  /** 旧行分段：按序拼接 === oldLine */
  old: WordSeg[];
  /** 新行分段：按序拼接 === newLine */
  new: WordSeg[];
}

/** 词级 diff 的行长度保护：任一行超过该字符数则跳过行内高亮 */
export const WORD_DIFF_MAX_CHARS = 2000;
/** 词级 LCS 的 token 数乘积上限（控制单行 DP 开销） */
export const WORD_DIFF_TOKEN_LIMIT = 25_000;

/** 分词：连续字母/数字/下划线、连续空白、其余逐字符（CJK 天然逐字对比）。无损切分。 */
const TOKEN_RE = /\s+|[A-Za-z0-9_]+|[^A-Za-z0-9_\s]/g;

function tokenize(line: string): string[] {
  return line.match(TOKEN_RE) ?? [];
}

/** 词级 diff：对一对修改行做行内 token 级 LCS（O(nm)，带行长/token 规模上限保护），
 *  输出两侧分段用于行内二次高亮；超限时返回 null，调用方退回整行高亮。 */
export function wordDiff(oldLine: string, newLine: string): WordDiffResult | null {
  if (oldLine === newLine) {
    return { old: [{ text: oldLine, changed: false }], new: [{ text: newLine, changed: false }] };
  }
  if (oldLine.length > WORD_DIFF_MAX_CHARS || newLine.length > WORD_DIFF_MAX_CHARS) return null;
  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  if (a.length * b.length > WORD_DIFF_TOKEN_LIMIT) return null;

  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    const row = i * w;
    const below = row + w;
    const ai = a[i];
    for (let j = m - 1; j >= 0; j--) {
      dp[row + j] = ai === b[j] ? dp[below + j + 1] + 1 : Math.max(dp[below + j], dp[row + j + 1]);
    }
  }

  const oldSegs: WordSeg[] = [];
  const newSegs: WordSeg[] = [];
  const push = (segs: WordSeg[], text: string, changed: boolean) => {
    const last = segs[segs.length - 1];
    if (last && last.changed === changed) last.text += text;
    else segs.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(oldSegs, a[i], false);
      push(newSegs, b[j], false);
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      push(oldSegs, a[i++], true);
    } else {
      push(newSegs, b[j++], true);
    }
  }
  while (i < n) push(oldSegs, a[i++], true);
  while (j < m) push(newSegs, b[j++], true);
  return { old: oldSegs, new: newSegs };
}

/* ---------- Unified diff 导出（下载 .diff） ---------- */

export interface UnifiedDiffOptions extends DiffOptions {
  /** 上下文行数（默认 3，钳制到 0-20） */
  context?: number;
  labelA?: string;
  labelB?: string;
  maxLines?: number;
}

/** 生成 Unified diff 文本（`--- / +++ / @@ -x,y +x,y @@`，行为同忽略选项）。
 *  无差异时返回空串。 */
export function toUnifiedDiff(aText: string, bText: string, opts?: UnifiedDiffOptions): string {
  const context = Math.max(0, Math.min(20, opts?.context ?? 3));
  const { lines } = diffTextWithOptions(aText, bText, opts);
  const changePos: number[] = [];
  for (let k = 0; k < lines.length; k++) if (lines[k].type !== "same") changePos.push(k);
  if (changePos.length === 0) return "";

  // 变更之间同线间隔 ≤ 2*context 时并入同一 hunk（标准 git 行为）
  const hunks: Array<[number, number]> = [];
  let hs = changePos[0];
  let he = changePos[0];
  for (let t = 1; t < changePos.length; t++) {
    if (changePos[t] - he - 1 <= 2 * context) he = changePos[t];
    else {
      hunks.push([hs, he]);
      hs = he = changePos[t];
    }
  }
  hunks.push([hs, he]);

  const out: string[] = [`--- ${opts?.labelA ?? "a"}`, `+++ ${opts?.labelB ?? "b"}`];
  for (const [s, e] of hunks) {
    const from = Math.max(0, s - context);
    const to = Math.min(lines.length - 1, e + context);
    let aStart = -1;
    let bStart = -1;
    let aCount = 0;
    let bCount = 0;
    for (let k = from; k <= to; k++) {
      const l = lines[k];
      if (l.aIdx !== undefined) {
        if (aStart < 0) aStart = l.aIdx;
        aCount++;
      }
      if (l.bIdx !== undefined) {
        if (bStart < 0) bStart = l.bIdx;
        bCount++;
      }
    }
    // 纯插入/纯删除的空侧：起始行 = hunk 前一个上下文行的行号（1 基）；文件头为 0
    const prev = from > 0 ? lines[from - 1] : undefined;
    const aNo = aCount > 0 ? aStart + 1 : prev && prev.aIdx !== undefined ? prev.aIdx + 1 : 0;
    const bNo = bCount > 0 ? bStart + 1 : prev && prev.bIdx !== undefined ? prev.bIdx + 1 : 0;
    out.push(`@@ -${aNo},${aCount} +${bNo},${bCount} @@`);
    for (let k = from; k <= to; k++) {
      const l = lines[k];
      out.push(`${l.type === "same" ? " " : l.type === "del" ? "-" : "+"}${l.text}`);
    }
  }
  return out.join("\n");
}
