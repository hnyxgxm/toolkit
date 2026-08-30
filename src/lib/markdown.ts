/** 轻量、安全的 Markdown 渲染（先转义 HTML 再做行内替换，避免 XSS） */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c) => `<code class="px-1.5 py-0.5 rounded bg-white/10 text-rose-300">${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => {
      const safe = /^(https?:|mailto:|\/|#)/i.test(u) ? u : "#";
      return `<a href="${safe}" class="text-blue-400 underline" target="_blank" rel="noopener noreferrer">${t}</a>`;
    });
}

export function renderMarkdown(src: string): string {
  const lines = esc(src).split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre class="rounded-xl bg-black/40 border border-white/[0.06] p-4 overflow-auto my-3"><code class="text-sm font-mono text-neutral-300">${codeBuf.join("\n")}</code></pre>`);
        codeBuf = []; inCode = false;
      } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    if (!line.trim()) { closeList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; const sizes = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-sm"]; out.push(`<h${lvl} class="font-bold text-white ${sizes[lvl - 1]} mt-5 mb-2">${inline(h[2])}</h${lvl}>`); continue; }

    if (/^(---|\*\*\*)\s*$/.test(line)) { closeList(); out.push('<hr class="border-white/10 my-5" />'); continue; }

    if (/^&gt;\s?/.test(line)) { closeList(); out.push(`<blockquote class="border-l-2 border-blue-500/50 pl-4 text-neutral-400 my-2">${inline(line.replace(/^&gt;\s?/, ""))}</blockquote>`); continue; }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { if (listType !== "ul") { closeList(); out.push('<ul class="list-disc pl-6 my-2 space-y-1">'); listType = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); continue; }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { if (listType !== "ol") { closeList(); out.push('<ol class="list-decimal pl-6 my-2 space-y-1">'); listType = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); continue; }

    closeList();
    out.push(`<p class="my-2 leading-relaxed">${inline(line)}</p>`);
  }
  if (inCode) out.push(`<pre class="rounded-xl bg-black/40 border border-white/[0.06] p-4 overflow-auto my-3"><code>${codeBuf.join("\n")}</code></pre>`);
  closeList();
  return out.join("\n");
}
