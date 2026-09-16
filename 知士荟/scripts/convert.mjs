/**
 * 知士荟（learnerhub.net）Markdown → 站内格式转换器
 *
 * 用法：
 *   npm install marked prismjs
 *   node convert.mjs manifest.json
 *
 * manifest.json 示例：
 * [
 *   {
 *     "file": "D:/Guiyuan1111/blogs/posts/xxx.md",
 *     "title": "可选。省略则自动取正文首个 H1（去掉反引号/加粗标记）",
 *     "summary": "贡献内容摘要，必填，≤150 字",
 *     "tags": ["标签1", "标签2"]
 *   }
 * ]
 *
 * 输出：out/article_1.html、out/meta.json（含 title/summary/tags/htmlFile）
 *
 * 转换规则（对齐站内 TinyMCE「插入/编辑代码示例」的原生格式）：
 *  - 代码围栏 → <pre class="language-x">…Prism token span…</pre>（无内层 code）
 *  - 语言别名：bat→batch、sh/shell→bash、js→javascript、ps→powershell
 *  - 无语言围栏 → <pre class="language-text">
 *  - GitHub 提示框（> [!NOTE] 等）→ 块引用内彩色加粗标签
 *  - 首个 H1 从正文剥离（标题单独填标题框）
 */
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import Prism from "prismjs";
import "prismjs/components/prism-powershell.js";
import "prismjs/components/prism-batch.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-diff.js";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("用法: node convert.mjs manifest.json");
  process.exit(1);
}

const LANG_ALIAS = { bat: "batch", shell: "bash", sh: "bash", js: "javascript", ps: "powershell" };
const ALERTS = [
  ["[!NOTE]", "#1668dc", "📌 NOTE"],
  ["[!TIP]", "#389e0d", "💡 TIP"],
  ["[!IMPORTANT]", "#d4380d", "❗ IMPORTANT"],
  ["[!WARNING]", "#d46b08", "⚠️ WARNING"],
];
const unescape = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync("out", { recursive: true });

const meta = [];
manifest.forEach((post, idx) => {
  let md = fs.readFileSync(post.file, "utf8");

  const h1Line = md.split("\n").find((l) => l.startsWith("# "));
  let title = post.title || (h1Line || "").replace(/^#\s+/, "").replace(/`/g, "").replace(/\*\*/g, "").trim();
  if (!title) throw new Error(`${post.file}: 无标题`);
  if (title.length > 50) console.warn(`⚠️ 《${title.slice(0, 20)}…》标题 ${title.length} 字，超过站内 50 字上限，请人工缩短`);
  md = md.split("\n").filter((l) => l !== h1Line).join("\n");

  for (const [from, color, label] of ALERTS) {
    md = md.replaceAll(from, `<span style="color:${color};font-weight:600;">${label}</span>`);
  }

  let html = marked.parse(md, { gfm: true, breaks: false });

  html = html.replace(
    /<pre><code class="language-([\w+-]+)">([\s\S]*?)<\/code><\/pre>/g,
    (_, langRaw, escaped) => {
      const lang = LANG_ALIAS[langRaw] || langRaw;
      const code = unescape(escaped);
      const grammar = Prism.languages[lang];
      const body = grammar
        ? Prism.highlight(code, grammar, lang)
        : escaped;
      return `<pre class="language-${lang}">${body}</pre>`;
    }
  );
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, '<pre class="language-text">$1</pre>');

  const outFile = `article_${idx + 1}.html`;
  fs.writeFileSync(path.join("out", outFile), html, "utf8");
  meta.push({
    file: post.file,
    title,
    summary: post.summary,
    tags: post.tags || [],
    htmlFile: path.join("out", outFile),
    htmlBytes: Buffer.byteLength(html),
  });
});

fs.writeFileSync(path.join("out", "meta.json"), JSON.stringify(meta, null, 2), "utf8");
console.log(
  meta
    .map((m) => `《${m.title.slice(0, 24)}…》 摘要${(m.summary || "").length}字 HTML ${m.htmlBytes}B → ${m.htmlFile}`)
    .join("\n")
);
