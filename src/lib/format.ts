/** 数字与文本格式化工具 */

export function fmt(n: number, digits = 0): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 金额：千分位，保留必要小数 */
export function money(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/** 剪切板复制，返回是否成功（带 execCommand 兜底） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 校验并美色彩输出错误信息 */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
